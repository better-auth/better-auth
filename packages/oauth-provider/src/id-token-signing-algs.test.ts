import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { decodeProtectedHeader } from "jose";
import { describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";

/**
 * @see https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderMetadata
 */
describe("id_token_signing_alg_values_supported with mixed signing keys", async () => {
	const authServerOrigin = "http://localhost:3000";
	const issuer = `${authServerOrigin}/api/auth`;
	const redirectUri = "http://localhost:5000/api/auth/callback/mixed-keys";

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerOrigin,
		plugins: [
			jwt({
				jwks: {
					keyPairConfig: { alg: "RS256", modulusLength: 2048 },
					keyPairConfigs: [{ alg: "ES256" }],
				},
			}),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
			}),
		],
	});
	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: authServerOrigin,
		fetchOptions: { customFetchImpl, headers },
	});

	it("advertises only the primary algorithm, and ID tokens use it", async () => {
		const metadata = await auth.api.getOpenIdConfig();
		expect(metadata.id_token_signing_alg_values_supported).toEqual(["RS256"]);

		const oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				application_type: "native",
				token_endpoint_auth_method: "client_secret_post",
				skip_consent: true,
			},
		});
		if (!oauthClient.client_id || !oauthClient.client_secret) {
			throw new Error("client was not created");
		}
		const options = {
			clientId: oauthClient.client_id,
			clientSecret: oauthClient.client_secret,
			redirectURI: redirectUri,
		};

		const codeVerifier = generateRandomString(32);
		const authUrl = await createAuthorizationURL({
			id: "mixed-keys",
			options,
			redirectURI: "",
			authorizationEndpoint: `${issuer}/oauth2/authorize`,
			state: "mixed-keys-state",
			scopes: ["openid"],
			codeVerifier,
		});
		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") ?? "";
			},
		});
		const code = new URL(callbackRedirectUrl).searchParams.get("code");
		expect(code).toBeTruthy();

		const { body, headers: tokenHeaders } = await authorizationCodeRequest({
			code: code!,
			codeVerifier,
			redirectURI: redirectUri,
			options,
		});
		const tokens = await client.$fetch<{ id_token?: string }>("/oauth2/token", {
			method: "POST",
			body,
			headers: tokenHeaders,
		});

		const idTokenAlg = decodeProtectedHeader(tokens.data!.id_token!).alg;
		expect(idTokenAlg).toBe("RS256");
		expect(metadata.id_token_signing_alg_values_supported).toContain(
			idTokenAlg,
		);
	});
});
