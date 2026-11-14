import { CLIENT_ASSERTION_TYPE } from "@better-auth/core/oauth2";
import { generateRandomString } from "better-auth/crypto";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { oauthProvider } from "./oauth";

/**
 * A `baseURL` that already has a path keeps its trailing slash, so joining an
 * endpoint path onto it must not leave `//`. The empty segment makes a
 * different URI, because normalization removes only dot-segments.
 * @see https://www.rfc-editor.org/rfc/rfc3986#section-3.3
 * @see https://www.rfc-editor.org/rfc/rfc3986#section-6.2.2.3
 */
describe("baseURL with a trailing slash", async () => {
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: "http://localhost:3000/api/auth/",
		plugins: [
			jwt(),
			oauthProvider({ loginPage: "/login", consentPage: "/consent" }),
		],
	});
	const { headers } = await signInWithTestUser();

	it("advertises endpoint URLs that route", async () => {
		const metadata = await auth.api.getOAuthServerConfig();
		for (const url of [
			metadata.authorization_endpoint,
			metadata.token_endpoint,
			metadata.introspection_endpoint,
			metadata.revocation_endpoint,
		]) {
			expect(url).not.toMatch(/[^:]\/\//);
		}
		const response = await customFetchImpl(metadata.token_endpoint, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ grant_type: "client_credentials" }),
		});
		expect(response.status).not.toBe(404);
	});

	it("accepts a client assertion for the advertised token endpoint", async () => {
		const { privateKey, publicKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		const client = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "private_key_jwt",
				grant_types: ["client_credentials"],
				scope: "openid",
				jwks: {
					keys: [{ ...(await exportJWK(publicKey)), kid: "k", alg: "RS256" }],
				},
			},
		});
		const { token_endpoint: tokenEndpoint } =
			await auth.api.getOAuthServerConfig();
		const now = Math.floor(Date.now() / 1000);
		const assertion = await new SignJWT({})
			.setProtectedHeader({ alg: "RS256", kid: "k" })
			.setIssuer(client.client_id)
			.setSubject(client.client_id)
			.setAudience(tokenEndpoint)
			.setIssuedAt(now)
			.setExpirationTime(now + 60)
			.setJti(generateRandomString(16))
			.sign(privateKey);
		const response = await customFetchImpl(tokenEndpoint, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "client_credentials",
				scope: "openid",
				client_assertion_type: CLIENT_ASSERTION_TYPE,
				client_assertion: assertion,
			}),
		});
		// The client has no client_credentials scopes, so a rejection after
		// authentication shows the assertion audience was accepted.
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "unauthorized_client",
		});
	});
});
