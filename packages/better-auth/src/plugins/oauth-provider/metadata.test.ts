import { describe, it, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { jwt, type JwtOptions } from "../jwt";
import { oauthProvider, type OAuthOptions } from ".";
import { createAuthClient } from "../../client";
import { oauthProviderClient } from "./client";

describe("oauth metadata", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const baseURL = `${authServerBaseUrl}/api/auth`;
	const baseClaims = [
		"sub",
		"iss",
		"aud",
		"exp",
		"iat",
		"sid",
		"scope",
		"azp",
		"email",
		"email_verified",
		"name",
		"picture",
		"family_name",
		"given_name",
	];

	async function createTestInstance(opts?: {
		oauthProviderConfig?: Omit<OAuthOptions, "loginPage" | "consentPage">;
		jwtConfig?: JwtOptions;
	}) {
		const { customFetchImpl } = await getTestInstance({
			baseURL: authServerBaseUrl,
			plugins: [
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					...opts?.oauthProviderConfig,
				}),
				...(opts?.oauthProviderConfig?.disableJWTPlugin
					? []
					: [jwt(opts?.jwtConfig)]),
			],
		});

		const unauthenticatedClient = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: authServerBaseUrl,
			fetchOptions: {
				customFetchImpl,
			},
		});

		return {
			client: unauthenticatedClient,
		};
	}

	it("should get openid, equivalent auth server", async () => {
		const { client } = await createTestInstance();
		const metadata = await client[".wellKnown"].openidConfiguration();
		expect(metadata.data).toMatchObject({
			scopes_supported: ["openid", "profile", "email", "offline_access"],
			issuer: baseURL,
			authorization_endpoint: `${baseURL}/oauth2/authorize`,
			token_endpoint: `${baseURL}/oauth2/token`,
			jwks_uri: `${baseURL}/jwks`,
			registration_endpoint: `${baseURL}/oauth2/register`,
			introspection_endpoint: `${baseURL}/oauth2/introspect`,
			revocation_endpoint: `${baseURL}/oauth2/revoke`,
			response_types_supported: ["code"],
			response_modes_supported: ["query"],
			grant_types_supported: [
				"authorization_code",
				"client_credentials",
				"refresh_token",
			],
			token_endpoint_auth_methods_supported: [
				"client_secret_basic",
				"client_secret_post",
			],
			introspection_endpoint_auth_methods_supported: [
				"client_secret_basic",
				"client_secret_post",
			],
			revocation_endpoint_auth_methods_supported: [
				"client_secret_basic",
				"client_secret_post",
			],
			code_challenge_methods_supported: ["S256"],
			claims_supported: baseClaims,
			userinfo_endpoint: `${baseURL}/oauth2/userinfo`,
			subject_types_supported: ["public"],
			id_token_signing_alg_values_supported: ["EdDSA"],
			acr_values_supported: ["urn:mace:incommon:iap:bronze"],
		});
		const oauthMetadata = await client[".wellKnown"].oauthAuthorizationServer();
		expect(oauthMetadata.data).toMatchObject(metadata.data ?? {});
	});

	it("should not have an openid-configuration, has auth server configuration", async () => {
		const scopes = ["create:test"];
		const { client } = await createTestInstance({
			oauthProviderConfig: {
				scopes,
			},
		});
		const metadata = await client[".wellKnown"].openidConfiguration();
		expect(metadata.error?.status).toBe(404);
		const oauthMetadata = await client[".wellKnown"].oauthAuthorizationServer();
		expect(oauthMetadata.data).toMatchObject({
			scopes_supported: scopes,
			issuer: baseURL,
			authorization_endpoint: `${baseURL}/oauth2/authorize`,
			token_endpoint: `${baseURL}/oauth2/token`,
			jwks_uri: `${baseURL}/jwks`,
			registration_endpoint: `${baseURL}/oauth2/register`,
			introspection_endpoint: `${baseURL}/oauth2/introspect`,
			revocation_endpoint: `${baseURL}/oauth2/revoke`,
			response_types_supported: ["code"],
			response_modes_supported: ["query"],
			grant_types_supported: [
				"authorization_code",
				"client_credentials",
				"refresh_token",
			],
			token_endpoint_auth_methods_supported: [
				"client_secret_basic",
				"client_secret_post",
			],
			introspection_endpoint_auth_methods_supported: [
				"client_secret_basic",
				"client_secret_post",
			],
			revocation_endpoint_auth_methods_supported: [
				"client_secret_basic",
				"client_secret_post",
			],
			code_challenge_methods_supported: ["S256"],
		});
	});

	it("should utilize advertised metadata fields", async () => {
		const advertisedScopes = ["email"];
		const advertisedClaims = ["sub", "iss", "aud", "exp", "iat", "scope"];
		const { client } = await createTestInstance({
			oauthProviderConfig: {
				advertisedMetadata: {
					scopes_supported: advertisedScopes,
					claims_supported: advertisedClaims,
				},
			},
		});
		const metadata = await client[".wellKnown"].openidConfiguration();
		expect(metadata.data).toMatchObject({
			scopes_supported: advertisedScopes,
			claims_supported: advertisedClaims,
		});
		const oauthMetadata = await client[".wellKnown"].oauthAuthorizationServer();
		expect(oauthMetadata.data).toMatchObject(metadata.data ?? {});
	});

	it("should fail if advertised scope invalid", async () => {
		const advertisedScopes = ["create:test"];
		expect(() =>
			getTestInstance({
				baseURL: authServerBaseUrl,
				plugins: [
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						advertisedMetadata: {
							scopes_supported: advertisedScopes,
						},
					}),
					jwt(),
				],
			}),
		).toThrowError(
			"advertisedMetadata.scopes_supported create:test not found in scopes",
		);
	});

	it("should fail if advertised claim not a valid claim", async () => {
		const advertisedClaims = ["http://example.com/roles"];
		expect(() =>
			getTestInstance({
				baseURL: authServerBaseUrl,
				plugins: [
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						advertisedMetadata: {
							claims_supported: advertisedClaims,
						},
					}),
					jwt(),
				],
			}),
		).toThrowError(
			"advertisedMetadata.claims_supported http://example.com/roles not found in claims",
		);
	});

	it("should advertise custom claims", async () => {
		const customClaims = ["http://example.com/roles"];
		const { client } = await createTestInstance({
			oauthProviderConfig: {
				customClaims: customClaims,
			},
		});
		const metadata = await client[".wellKnown"].openidConfiguration();
		expect(metadata.data).toMatchObject({
			claims_supported: [...baseClaims, ...customClaims],
		});
		const oauthMetadata = await client[".wellKnown"].oauthAuthorizationServer();
		expect(oauthMetadata.data).toMatchObject(metadata.data ?? {});
	});

	it("should use the remoteJwks url", async () => {
		const remoteUrl = "http://example.com/.well-known/openid-configuration";
		const alg = "ES256";
		const { client } = await createTestInstance({
			jwtConfig: {
				jwks: {
					remoteUrl,
					keyPairConfig: {
						alg,
					},
				},
			},
		});
		const metadata = await client[".wellKnown"].openidConfiguration();
		expect(metadata.data).toMatchObject({
			jwks_uri: remoteUrl,
			id_token_signing_alg_values_supported: [alg],
		});
		const oauthMetadata = await client[".wellKnown"].oauthAuthorizationServer();
		expect(oauthMetadata.data).toMatchObject(metadata.data ?? {});
	});

	it("should support disableJWTPlugin", async () => {
		const { client } = await createTestInstance({
			oauthProviderConfig: {
				disableJWTPlugin: true,
			},
		});
		const metadata = await client[".wellKnown"].openidConfiguration();
		expect(metadata.data).toMatchObject({
			id_token_signing_alg_values_supported: ["HS256"],
		});
		const oauthMetadata = await client[".wellKnown"].oauthAuthorizationServer();
		expect(oauthMetadata.data).toMatchObject(metadata.data ?? {});
	});
});
