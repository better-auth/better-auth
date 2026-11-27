import { createHash } from "node:crypto";
import type { JWK } from "jose";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { apple } from "../social-providers/apple";
import { cognito } from "../social-providers/cognito";
import { facebook } from "../social-providers/facebook";
import { google } from "../social-providers/google";
import { microsoft } from "../social-providers/microsoft-entra-id";
import { paypal } from "../social-providers/paypal";
import type { OAuthIdTokenConfig } from "./oauth-provider";
import {
	supportsIdTokenSignIn,
	verifyProviderIdToken,
} from "./verify-id-token";

type ProviderWithIdTokenConfig = Parameters<typeof verifyProviderIdToken>[0];

const ISSUER = "https://issuer.test";
const AUDIENCE = "client-123";

async function makeKeyset() {
	const { publicKey, privateKey } = await generateKeyPair("RS256", {
		extractable: true,
	});
	const jwk: JWK = await exportJWK(publicKey);
	jwk.kid = "test-key";
	jwk.alg = "RS256";
	jwk.use = "sig";
	const jwks = createLocalJWKSet({ keys: [jwk] });
	const sign = (claims: Record<string, unknown>, key = privateKey) =>
		new SignJWT(claims)
			.setProtectedHeader({ alg: "RS256", kid: "test-key" })
			.setIssuer(ISSUER)
			.setAudience(AUDIENCE)
			.setIssuedAt()
			.setExpirationTime("1h")
			.sign(key);
	return { jwks, sign, privateKey };
}

function providerWith(
	idToken: OAuthIdTokenConfig | undefined,
	options: Record<string, unknown> = {},
): ProviderWithIdTokenConfig {
	return { id: "test-provider", idToken, options };
}

const sha256Hex = (value: string) =>
	createHash("sha256").update(value).digest("hex");

describe("verifyProviderIdToken", () => {
	it("accepts a correctly signed token with matching issuer, audience, and nonce", async () => {
		const { jwks, sign } = await makeKeyset();
		const token = await sign({ sub: "u1", nonce: "n1" });
		const provider = providerWith({ jwks, issuer: ISSUER, audience: AUDIENCE });
		expect(await verifyProviderIdToken(provider, token, "n1")).toBe(true);
	});

	it("accepts a signed token without a kid header when the JWKS resolves it", async () => {
		const { jwks, privateKey } = await makeKeyset();
		const token = await new SignJWT({ sub: "u1" })
			.setProtectedHeader({ alg: "RS256" })
			.setIssuer(ISSUER)
			.setAudience(AUDIENCE)
			.setIssuedAt()
			.setExpirationTime("1h")
			.sign(privateKey);
		const provider = providerWith({ jwks, issuer: ISSUER, audience: AUDIENCE });
		expect(await verifyProviderIdToken(provider, token)).toBe(true);
	});

	it("rejects a token signed by a different key (forgery)", async () => {
		const { jwks } = await makeKeyset();
		const attacker = await generateKeyPair("RS256", { extractable: true });
		const forged = await new SignJWT({ sub: "victim" })
			.setProtectedHeader({ alg: "RS256", kid: "test-key" })
			.setIssuer(ISSUER)
			.setAudience(AUDIENCE)
			.setIssuedAt()
			.setExpirationTime("1h")
			.sign(attacker.privateKey);
		const provider = providerWith({ jwks, issuer: ISSUER, audience: AUDIENCE });
		expect(await verifyProviderIdToken(provider, forged)).toBe(false);
	});

	it("rejects an unsigned alg:none token", async () => {
		const { jwks } = await makeKeyset();
		const seg = (o: unknown) =>
			Buffer.from(JSON.stringify(o)).toString("base64url");
		const none = `${seg({ alg: "none", kid: "test-key" })}.${seg({
			sub: "victim",
			iss: ISSUER,
			aud: AUDIENCE,
		})}.`;
		const provider = providerWith({ jwks, issuer: ISSUER, audience: AUDIENCE });
		expect(await verifyProviderIdToken(provider, none)).toBe(false);
	});

	it("requires the exp and iat claims every ID token carries", async () => {
		const { jwks, privateKey } = await makeKeyset();
		const provider = providerWith({ jwks, issuer: ISSUER, audience: AUDIENCE });
		const withoutExp = await new SignJWT({ sub: "u1" })
			.setProtectedHeader({ alg: "RS256", kid: "test-key" })
			.setIssuer(ISSUER)
			.setAudience(AUDIENCE)
			.setIssuedAt()
			.sign(privateKey);
		const withoutIat = await new SignJWT({ sub: "u1" })
			.setProtectedHeader({ alg: "RS256", kid: "test-key" })
			.setIssuer(ISSUER)
			.setAudience(AUDIENCE)
			.setExpirationTime("1h")
			.sign(privateKey);

		expect(await verifyProviderIdToken(provider, withoutExp)).toBe(false);
		expect(await verifyProviderIdToken(provider, withoutIat)).toBe(false);
	});

	it("rejects a wrong issuer or audience", async () => {
		const { jwks, sign } = await makeKeyset();
		const token = await sign({ sub: "u1" });
		expect(
			await verifyProviderIdToken(
				providerWith({ jwks, issuer: "https://evil.test", audience: AUDIENCE }),
				token,
			),
		).toBe(false);
		expect(
			await verifyProviderIdToken(
				providerWith({ jwks, issuer: ISSUER, audience: "other-client" }),
				token,
			),
		).toBe(false);
	});

	it("enforces nonce and supports exact-or-sha256 comparison", async () => {
		const { jwks, sign } = await makeKeyset();
		const raw = "raw-nonce";
		const exact = providerWith({ jwks, issuer: ISSUER, audience: AUDIENCE });
		const t1 = await sign({ sub: "u1", nonce: raw });
		expect(await verifyProviderIdToken(exact, t1, raw)).toBe(true);
		expect(await verifyProviderIdToken(exact, t1, "mismatch")).toBe(false);

		const hashed = providerWith({
			jwks,
			issuer: ISSUER,
			audience: AUDIENCE,
			nonceComparison: "exact-or-sha256",
		});
		const t2 = await sign({ sub: "u1", nonce: sha256Hex(raw) });
		expect(await verifyProviderIdToken(hashed, t2, raw)).toBe(true);
	});

	it("is fail-closed when no config and no override are present", async () => {
		const { sign } = await makeKeyset();
		const provider = providerWith(undefined);
		expect(supportsIdTokenSignIn(provider)).toBe(false);
		expect(
			await verifyProviderIdToken(provider, await sign({ sub: "u1" })),
		).toBe(false);
	});

	it("honors an options.verifyIdToken override", async () => {
		const provider = providerWith(undefined, {
			verifyIdToken: async () => true,
		});
		expect(supportsIdTokenSignIn(provider)).toBe(true);
		expect(await verifyProviderIdToken(provider, "anything")).toBe(true);
	});

	it("honors disableIdTokenSignIn even with a valid config", async () => {
		const { jwks, sign } = await makeKeyset();
		const provider = providerWith(
			{ jwks, issuer: ISSUER, audience: AUDIENCE },
			{ disableIdTokenSignIn: true },
		);
		expect(supportsIdTokenSignIn(provider)).toBe(false);
		expect(
			await verifyProviderIdToken(provider, await sign({ sub: "u1" })),
		).toBe(false);
	});

	it("is fail-closed when a custom verifier throws", async () => {
		const overrideThrows = providerWith(undefined, {
			verifyIdToken: async () => {
				throw new Error("override boom");
			},
		});
		expect(await verifyProviderIdToken(overrideThrows, "token")).toBe(false);

		const remoteVerifyThrows = providerWith({
			verify: async () => {
				throw new Error("remote boom");
			},
		});
		expect(await verifyProviderIdToken(remoteVerifyThrows, "token")).toBe(
			false,
		);
	});

	it("gates opaque (non-JWS) tokens behind allowOpaqueToken", async () => {
		const { jwks } = await makeKeyset();
		const opaque = "opaque-access-token";
		expect(
			await verifyProviderIdToken(
				providerWith({
					jwks,
					issuer: ISSUER,
					audience: AUDIENCE,
					allowOpaqueToken: true,
				}),
				opaque,
			),
		).toBe(true);
		expect(
			await verifyProviderIdToken(
				providerWith({ jwks, issuer: ISSUER, audience: AUDIENCE }),
				opaque,
			),
		).toBe(false);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11636
	 */
	describe("clock skew", () => {
		// Offsets sit 5s inside and outside the 30s tolerance on each time claim.
		it.each([
			["nbf", 25, true],
			["nbf", 35, false],
			["iat", 25, true],
			["iat", 35, false],
			["exp", -25, true],
			["exp", -35, false],
		] as const)(
			"%s %is from now verifies: %s",
			async (claim, offset, valid) => {
				const { jwks, privateKey } = await makeKeyset();
				const now = Math.floor(Date.now() / 1000);
				const times = { iat: now - 60, exp: now + 3600, [claim]: now + offset };
				const token = await new SignJWT(
					claim === "nbf" ? { sub: "u1", nbf: times.nbf } : { sub: "u1" },
				)
					.setProtectedHeader({ alg: "RS256", kid: "test-key" })
					.setIssuer(ISSUER)
					.setAudience(AUDIENCE)
					.setIssuedAt(times.iat)
					.setExpirationTime(times.exp)
					.sign(privateKey);
				const provider = providerWith({
					jwks,
					issuer: ISSUER,
					audience: AUDIENCE,
					maxTokenAge: "1h",
				});
				expect(await verifyProviderIdToken(provider, token)).toBe(valid);
			},
		);
	});

	describe("without a configured audience", () => {
		it.each<[string, string | string[] | undefined]>([
			["missing", undefined],
			["an empty string", ""],
			["an empty list", []],
			["a list of empty strings", [""]],
		])("rejects a token when the audience is %s", async (_, audience) => {
			const { jwks, sign } = await makeKeyset();
			const provider = providerWith({
				jwks,
				issuer: ISSUER,
				// Providers pass `clientId` through, which is undefined when it is not set.
				audience: audience as string | string[],
			});

			await expect(
				verifyProviderIdToken(provider, await sign({ sub: "u1" })),
			).resolves.toBe(false);
		});
	});

	describe("provider regressions", () => {
		it("PayPal no longer accepts client id_token sign-in", () => {
			// Previously verifyIdToken returned true for any decodable token without
			// checking the signature. PayPal resolves identity from the access token, so
			// it now declares no id_token config and the client path is fail-closed.
			const provider = paypal({ clientId: "c", clientSecret: "s" });
			expect(supportsIdTokenSignIn(provider)).toBe(false);
		});

		it("Facebook supports id_token sign-in and still accepts opaque Graph tokens", async () => {
			const provider = facebook({ clientId: "c", clientSecret: "s" });
			expect(supportsIdTokenSignIn(provider)).toBe(true);
			expect(
				await verifyProviderIdToken(provider, "opaque-graph-access-token"),
			).toBe(true);
		});

		it("pins the signing algorithms of every provider that verifies against a JWKS", () => {
			const providers = [
				apple({ clientId: "c", clientSecret: "s" }),
				cognito({
					clientId: "c",
					clientSecret: "s",
					domain: "auth.example.com",
					region: "us-east-1",
					userPoolId: "us-east-1_pool",
				}),
				facebook({ clientId: "c", clientSecret: "s" }),
				google({ clientId: "c", clientSecret: "s" }),
				microsoft({ clientId: "c", clientSecret: "s" }),
			];
			const pinned = Object.fromEntries(
				providers.map((provider) => [
					provider.id,
					provider.idToken && "jwks" in provider.idToken
						? provider.idToken.algorithms
						: undefined,
				]),
			);

			expect(pinned).toEqual({
				apple: ["RS256"],
				cognito: ["RS256"],
				facebook: ["RS256"],
				google: ["RS256"],
				microsoft: ["RS256"],
			});
		});
	});
});
