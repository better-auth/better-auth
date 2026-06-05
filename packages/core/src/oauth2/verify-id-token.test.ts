import { createHash } from "node:crypto";
import type { JWK } from "jose";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { facebook } from "../social-providers/facebook";
import { paypal } from "../social-providers/paypal";
import type { OAuthIdTokenConfig, UpstreamProvider } from "./oauth-provider";
import {
	supportsIdTokenSignIn,
	verifyProviderIdToken,
} from "./verify-id-token";

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
): UpstreamProvider<any, any> {
	return { idToken, options } as UpstreamProvider<any, any>;
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
	});
});
