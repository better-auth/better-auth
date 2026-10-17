import { CompactSign, exportJWK, generateKeyPair, UnsecuredJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../env";
import { jwksCache } from "../oauth2/verify";
import { twitch } from "./twitch";

const options = { clientId: "twitch-client", clientSecret: "client-secret" };
const issuer = "https://id.twitch.tv/oauth2";
const jwksEndpoint = "https://id.twitch.tv/oauth2/keys";
const now = new Date("2026-01-01T00:00:00Z");
const issuedAt = Math.floor(now.getTime() / 1000);
const profile = {
	iss: issuer,
	sub: "provider-user",
	aud: options.clientId,
	iat: issuedAt,
	exp: issuedAt + 3600,
	email: "user@example.com",
	email_verified: true,
	preferred_username: "Provider User",
	picture: "https://example.com/avatar.png",
};
const { publicKey, privateKey } = await generateKeyPair("RS256", {
	extractable: true,
});
const { privateKey: otherPrivateKey } = await generateKeyPair("RS256");
const publicJWK = {
	...(await exportJWK(publicKey)),
	alg: "RS256",
	kid: "provider-key",
	use: "sig",
};
const mockedFetch = vi.fn<typeof fetch>();
const mockedWarn = vi.fn<typeof logger.warn>();

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(now);
	jwksCache.clear();
	mockedWarn.mockReset();
	vi.spyOn(logger, "warn").mockImplementation(mockedWarn);
	mockedFetch.mockReset();
	mockedFetch.mockImplementation(async () =>
		Response.json({ keys: [publicJWK] }),
	);
	vi.stubGlobal("fetch", mockedFetch);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

function signToken(
	overrides: Record<string, unknown> | string = {},
	key = privateKey,
	includeKid = true,
) {
	const payload =
		typeof overrides === "string"
			? overrides
			: JSON.stringify({ ...profile, ...overrides });
	return new CompactSign(new TextEncoder().encode(payload))
		.setProtectedHeader({
			alg: "RS256",
			...(includeKid ? { kid: "provider-key" } : {}),
		})
		.sign(key);
}

/**
 * @see https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation
 * @see https://dev.twitch.tv/docs/authentication/getting-tokens-oidc/#validating-an-id-token
 */
describe("twitch.getUserInfo", () => {
	it.each([true, false])(
		"maps signed tokens with kid=%s",
		async (includeKid) => {
			const result = await twitch(options).getUserInfo({
				idToken: await signToken({}, privateKey, includeKid),
			});

			expect(result?.data).toEqual(profile);
			expect(result?.user).toEqual({
				name: profile.preferred_username,
				email: profile.email,
				image: profile.picture,
				emailVerified: true,
			});
			expect(
				mockedFetch.mock.calls.map(([input]) => new Request(input).url),
			).toContain(jwksEndpoint);
		},
	);

	it.each([
		["wrong issuer", { iss: "https://other.example.com" }],
		["wrong audience", { aud: "other-client" }],
		[
			"untrusted additional audience",
			{ aud: [options.clientId, "other-client"], azp: options.clientId },
		],
		["expired", { exp: 0 }],
		["missing expiration", { exp: undefined }],
		["missing issued-at", { iat: undefined }],
		["missing subject", { sub: undefined }],
		["numeric subject", { sub: 123 }],
		["null subject", { sub: null }],
		["empty subject", { sub: "" }],
	] as const)("rejects %s before profile mapping", async (_, overrides) => {
		const mapProfileToUser = vi.fn(() => ({}));
		const result = await twitch({ ...options, mapProfileToUser }).getUserInfo({
			idToken: await signToken(overrides),
		});

		expect(result).toBeNull();
		expect(mapProfileToUser).not.toHaveBeenCalled();
	});

	it.each(["unsigned", "wrong signing key"])(
		"rejects tokens with %s",
		async (kind) => {
			const token =
				kind === "unsigned"
					? new UnsecuredJWT(profile).encode()
					: await signToken({}, otherPrivateKey);

			expect(await twitch(options).getUserInfo({ idToken: token })).toBeNull();
		},
	);

	it.each([
		["exp", -29],
		["nbf", 29],
	] as const)("accepts %s with %ss of clock skew", async (claim, offset) => {
		const result = await twitch(options).getUserInfo({
			idToken: await signToken({ [claim]: issuedAt + offset }),
		});
		expect(result?.data.sub).toBe(profile.sub);
	});

	it.each([
		["exp", -31],
		["nbf", 31],
	] as const)("rejects %s with %ss of clock skew", async (claim, offset) => {
		expect(
			await twitch(options).getUserInfo({
				idToken: await signToken({ [claim]: issuedAt + offset }),
			}),
		).toBeNull();
	});

	it.each(["iat", "exp"] as const)(
		"rejects a non-finite %s claim",
		async (claim) => {
			const payload = JSON.stringify({
				...profile,
				[claim]: "overflow",
			}).replace('"overflow"', "1e400");
			const token = await signToken(payload);

			expect(await twitch(options).getUserInfo({ idToken: token })).toBeNull();
		},
	);

	it("logs a safe claim error without exposing identity data", async () => {
		const token = await signToken({ iss: "https://other.example.com" });

		expect(await twitch(options).getUserInfo({ idToken: token })).toBeNull();
		const output = JSON.stringify(mockedWarn.mock.calls);
		expect(output).toContain("ERR_JWT_CLAIM_VALIDATION_FAILED");
		expect(output).not.toContain(token);
		expect(output).not.toContain(profile.email);
	});

	it.each([
		["unavailable", "JWKS_FETCH_FAILED"],
		["invalid", "ERR_JWKS_INVALID"],
	])("logs a safe reason for %s signing keys", async (kind, code) => {
		mockedFetch.mockImplementation(async () =>
			kind === "unavailable"
				? new Response("Unavailable", { status: 503 })
				: Response.json({ keys: {} }),
		);
		const token = await signToken();

		expect(await twitch(options).getUserInfo({ idToken: token })).toBeNull();
		const output = JSON.stringify(mockedWarn.mock.calls);
		expect(output).toContain(code);
		expect(output).not.toContain(token);
		expect(output).not.toContain(profile.email);
	});

	it("rejects invalid tokens even when a custom logger throws", async () => {
		mockedWarn.mockImplementationOnce(() => {
			throw new Error("logger failed");
		});

		await expect(
			twitch(options).getUserInfo({
				idToken: await signToken({ iss: "https://other.example.com" }),
			}),
		).resolves.toBeNull();
	});

	it("preserves the custom getUserInfo override", async () => {
		const custom = {
			data: profile,
			user: { email: profile.email, emailVerified: true },
		};
		const getUserInfo = vi.fn(async () => custom);
		const tokens = { idToken: "custom-token" };

		expect(await twitch({ ...options, getUserInfo }).getUserInfo(tokens)).toBe(
			custom,
		);
		expect(getUserInfo).toHaveBeenCalledWith(tokens);
	});
});
