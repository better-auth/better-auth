import { exportJWK, generateKeyPair, SignJWT, UnsecuredJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(now);
	jwksCache.clear();
	mockedFetch.mockReset();
	mockedFetch.mockImplementation(async () =>
		Response.json({ keys: [publicJWK] }),
	);
	vi.stubGlobal("fetch", mockedFetch);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

function signToken(
	overrides: Record<string, unknown> = {},
	key = privateKey,
	includeKid = true,
) {
	const payload: Record<string, unknown> = { ...profile, ...overrides };
	return new SignJWT(payload)
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
			{ aud: [options.clientId, "other-client"] },
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
