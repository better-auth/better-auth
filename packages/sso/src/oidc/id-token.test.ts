import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertOIDCAuthorizedParty, validateOIDCIdToken } from "./discovery";

describe("OIDC authorized party validation", () => {
	it("accepts the configured client as azp for a multi-audience token", () => {
		expect(() =>
			assertOIDCAuthorizedParty(
				{ aud: ["workforce-client", "api"], azp: "workforce-client" },
				"workforce-client",
			),
		).not.toThrow();
	});

	it.each([
		[{ aud: ["workforce-client", "api"] }, "missing azp"],
		[
			{ aud: ["workforce-client", "api"], azp: "another-client" },
			"incorrect azp",
		],
		[{ aud: "workforce-client", azp: "another-client" }, "incorrect azp"],
	])(
		"rejects %s (%s)",
		(payload: {
			aud: string | string[];
			azp?: string;
		}, _label) => {
			expect(() =>
				assertOIDCAuthorizedParty(payload, "workforce-client"),
			).toThrow("OIDC ID token authorized party does not match the client");
		},
	);
});

/**
 * @see https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation
 */
describe("OIDC ID token claim validation", async () => {
	const jwksEndpoint = "https://idp.example.com/jwks";
	const issuer = "https://idp.example.com";
	const clientId = "workforce-client";
	const { publicKey, privateKey } = await generateKeyPair("RS256");
	const jwks = { keys: [{ ...(await exportJWK(publicKey)), alg: "RS256" }] };

	const signIdToken = (claims: { exp?: string; iat?: boolean }) => {
		const jwt = new SignJWT({})
			.setProtectedHeader({ alg: "RS256" })
			.setIssuer(issuer)
			.setAudience(clientId)
			.setSubject("user-1");
		if (claims.exp) jwt.setExpirationTime(claims.exp);
		if (claims.iat) jwt.setIssuedAt();
		return jwt.sign(privateKey);
	};
	const validate = (token: string, audience = clientId) =>
		validateOIDCIdToken(
			token,
			jwksEndpoint,
			{
				audience,
				issuer,
			},
			() => true,
		);

	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json(jwks)),
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("accepts an ID token with exp and iat", async () => {
		const token = await signIdToken({ exp: "5m", iat: true });

		await expect(validate(token)).resolves.toMatchObject({
			payload: { sub: "user-1" },
		});
	});

	it.each([
		{ claim: "exp", claims: { iat: true } },
		{ claim: "iat", claims: { exp: "5m" } },
	])("rejects an ID token without $claim", async ({ claim, claims }) => {
		const token = await signIdToken(claims);

		await expect(validate(token)).rejects.toThrow(`"${claim}" claim`);
	});

	it("rejects an ID token when the provider has no client ID", async () => {
		const token = await signIdToken({ exp: "5m", iat: true });

		await expect(validate(token, "")).rejects.toThrow(
			"ID token audience is not configured",
		);
	});
});
