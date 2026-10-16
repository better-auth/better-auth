import { supportsIdTokenSignIn } from "@better-auth/core/oauth2";
import { paybin } from "@better-auth/core/social-providers";
import { exportJWK, generateKeyPair, SignJWT, UnsecuredJWT } from "jose";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const issuer = "https://idp.paybin.io";
const clientId = "paybin-app";
const { publicKey, privateKey } = await generateKeyPair("RS256", {
	extractable: true,
});
const otherKeys = await generateKeyPair("RS256");
const key = {
	...(await exportJWK(publicKey)),
	kid: "provider-key",
	alg: "RS256",
	use: "sig",
};
const server = setupServer(
	http.get(`${issuer}/.well-known/jwks.json`, () =>
		HttpResponse.json({ keys: [key] }),
	),
);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function tokenFor(kind = "valid", tokenIssuer = issuer) {
	const now = Math.floor(Date.now() / 1000);
	const claims = {
		sub: "provider-user",
		...(kind === "no email"
			? {}
			: {
					email: kind === "unverified email" ? null : "user@example.com",
					email_verified: kind !== "unverified email",
				}),
		iss: kind === "issuer" ? "https://other.example.com" : tokenIssuer,
		aud: kind === "audience" ? "other-app" : clientId,
		iat: now,
		...(kind === "missing expiration"
			? {}
			: { exp: kind === "expired" ? now - 120 : now + 3600 }),
	};
	if (kind === "unsigned") return new UnsecuredJWT(claims).encode();
	return new SignJWT(claims)
		.setProtectedHeader({ alg: "RS256", kid: "provider-key" })
		.sign(kind === "signature" ? otherKeys.privateKey : privateKey);
}

/**
 * @see https://developers.paybin.io/knowledge-center/oidc#token-management
 */
describe("paybin ID-token profiles", () => {
	it("maps a verified token without optional display claims", async () => {
		const provider = paybin({ clientId });
		const result = await provider.getUserInfo({ idToken: await tokenFor() });
		expect(result?.user).toMatchObject({
			email: "user@example.com",
			emailVerified: true,
			image: undefined,
		});
		expect(result?.data.sub).toBe("provider-user");
		expect(supportsIdTokenSignIn(provider)).toBe(false);
	});

	it.each([
		"issuer",
		"audience",
		"expired",
		"unsigned",
		"signature",
		"missing expiration",
	])("rejects %s tokens", async (kind) => {
		const result = await paybin({ clientId }).getUserInfo({
			idToken: await tokenFor(kind),
		});
		expect(result).toBeNull();
	});
});

/**
 * @see https://developers.paybin.io/knowledge-center/oidc#authorization-flow
 */
it.each(["https://idp.paybin.io", "https://paybin.example.com/"])(
	"uses the documented endpoints for %s",
	async (configuredIssuer) => {
		const base = configuredIssuer.replace(/\/+$/, "");
		const provider = paybin({
			clientId,
			clientSecret: "secret",
			issuer: configuredIssuer,
		});
		const url = await provider.createAuthorizationURL({
			state: "state",
			redirectURI: "https://example.com/callback",
			codeVerifier: "code-verifier",
		});
		expect(url.origin + url.pathname).toBe(`${base}/connect/authorize`);
		server.use(
			http.post(`${base}/connect/token`, async ({ request }) => {
				const body = new URLSearchParams(await request.text());
				expect(["authorization_code", "refresh_token"]).toContain(
					body.get("grant_type"),
				);
				return HttpResponse.json({
					access_token: "access-token",
					token_type: "Bearer",
				});
			}),
		);
		expect(
			(
				await provider.validateAuthorizationCode({
					code: "code",
					redirectURI: "https://example.com/callback",
					codeVerifier: "code-verifier",
				})
			)?.accessToken,
		).toBe("access-token");
		expect(
			(await provider.refreshAccessToken("refresh-token")).accessToken,
		).toBe("access-token");
	},
);

/**
 * @see https://developers.paybin.io/knowledge-center/oidc#available-scopes
 */
it("maps the provider's limited email claims", async () => {
	const result = await paybin({ clientId }).getUserInfo({
		idToken: await tokenFor("no email"),
	});
	expect(result?.user.email).toBeUndefined();
	expect(result?.user.emailVerified).toBe(false);
});

/**
 * @see https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation
 */
it("preserves the configured issuer's trailing slash", async () => {
	const configuredIssuer = "https://paybin.example.com/";
	server.use(
		http.get("https://paybin.example.com/.well-known/jwks.json", () =>
			HttpResponse.json({ keys: [key] }),
		),
	);
	const result = await paybin({
		clientId,
		issuer: configuredIssuer,
	}).getUserInfo({ idToken: await tokenFor("valid", configuredIssuer) });
	expect(result?.data.sub).toBe("provider-user");
});
