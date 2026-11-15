import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { User } from "better-auth/types";
import { describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthTokenIssueParams } from "./types";

const authServerBaseUrl = "http://localhost:3000";
const withIdTokenGrant = "urn:better-auth:test:with-id-token";
const withoutIdTokenGrant = "urn:better-auth:test:without-id-token";
const misusedGrant = "urn:better-auth:test:id-token-claims-without-id-token";
const refreshingGrant = "urn:better-auth:test:refresh-token-without-id-token";
type IssueParams = Pick<
	OAuthTokenIssueParams,
	"idToken" | "idTokenClaims" | "refreshToken"
>;
const formHeaders = {
	accept: "application/json",
	"content-type": "application/x-www-form-urlencoded",
};

/**
 * OIDC Core §3.1.3.3 requires an ID token from the authorization code flow, and
 * CIBA Core §10.1.1 from the CIBA grant, so only extension grants opt out.
 *
 * @see https://openid.net/specs/openid-connect-core-1_0.html#TokenResponse
 */
describe("oauth-provider - issueTokens without an ID token", async () => {
	let grantUser: User | undefined;
	const idTokenClaimCalls: string[] = [];
	const { auth, client, signInWithTestUser } = await getTestInstance(
		{
			baseURL: authServerBaseUrl,
			plugins: [
				jwt({ jwt: { issuer: authServerBaseUrl } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					clientPrivileges: () => true,
					customIdTokenClaims: () => {
						idTokenClaimCalls.push("option");
						return {};
					},
					extensions: [
						{
							claims: {
								idToken: () => {
									idTokenClaimCalls.push("extension");
									return {};
								},
							},
							grants: Object.fromEntries(
								(
									[
										[withIdTokenGrant, {}],
										[withoutIdTokenGrant, { idToken: false }],
										[
											misusedGrant,
											{ idToken: false, idTokenClaims: { extra: true } },
										],
										[
											refreshingGrant,
											{
												idToken: false,
												refreshToken: {
													id: "parent-refresh-token",
													token: "parent",
													userId: "user-1",
													scopes: ["openid", "offline_access"],
													createdAt: new Date(),
													expiresAt: new Date(Date.now() + 60_000),
												},
											},
										],
									] satisfies [string, IssueParams][]
								).map(([grantType, params]) => [
									grantType,
									async ({ provider }) => {
										const { client } = await provider.authenticateClient();
										return provider.issueTokens({
											client,
											scopes: ["openid", "profile", "offline_access"],
											user: grantUser,
											...params,
										});
									},
								]),
							),
						},
					],
				}),
			],
		},
		{ clientOptions: { plugins: [oauthProviderClient()] } },
	);
	const { headers, user } = await signInWithTestUser();
	grantUser = user;
	const oauthClient = await auth.api.adminCreateOAuthClient({
		headers,
		body: {
			redirect_uris: ["https://client.example.com/callback"],
			token_endpoint_auth_method: "client_secret_post",
			grant_types: [
				withIdTokenGrant,
				withoutIdTokenGrant,
				misusedGrant,
				refreshingGrant,
				"refresh_token",
			],
			scope: "openid profile offline_access",
		},
	});

	function requestTokens(grantType: string) {
		idTokenClaimCalls.length = 0;
		return client.$fetch<{
			id_token?: string;
			refresh_token?: string;
			scope: string;
		}>("/oauth2/token", {
			method: "POST",
			headers: formHeaders,
			body: new URLSearchParams({
				grant_type: grantType,
				client_id: oauthClient.client_id,
				client_secret: oauthClient.client_secret!,
			}),
		});
	}

	it("issues an ID token for openid by default", async () => {
		const response = await requestTokens(withIdTokenGrant);

		expect(response.error).toBeNull();
		expect(response.data?.id_token).toEqual(expect.any(String));
		expect(response.data?.refresh_token).toEqual(expect.any(String));
		expect(idTokenClaimCalls).toEqual(["extension", "option"]);
	});

	it("issues no ID token, and runs no ID token claim callback, with idToken: false", async () => {
		const response = await requestTokens(withoutIdTokenGrant);

		expect(response.error).toBeNull();
		expect(response.data?.scope).toBe("openid profile offline_access");
		expect(response.data).not.toHaveProperty("id_token");
		expect(idTokenClaimCalls).toEqual([]);
	});

	it("issues no refresh token with idToken: false, so a refresh cannot issue an ID token", async () => {
		const response = await requestTokens(withoutIdTokenGrant);

		expect(response.error).toBeNull();
		expect(response.data).not.toHaveProperty("refresh_token");
	});

	it("rejects idTokenClaims passed with idToken: false", async () => {
		const response = await requestTokens(misusedGrant);

		expect(response.error?.status).toBe(500);
		expect(idTokenClaimCalls).toEqual([]);
	});

	it("rejects a refreshToken passed with idToken: false", async () => {
		const response = await requestTokens(refreshingGrant);

		expect(response.error).toMatchObject({
			status: 500,
			error: "server_error",
			error_description:
				"issueTokens does not accept idToken: false with refreshToken",
		});
	});
});
