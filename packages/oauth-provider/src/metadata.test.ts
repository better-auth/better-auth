import type { BetterAuthOptions } from "@better-auth/core";
import { APIError, BetterAuthError } from "@better-auth/core/error";
import { createAuthClient } from "better-auth/client";
import type { JwtOptions } from "better-auth/plugins/jwt";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProviderResourceClient } from "./client-resource";
import {
	oauthProviderAuthServerMetadata,
	oauthProviderOpenIdConfigMetadata,
} from "./metadata";
import { oauthProvider } from "./oauth";
import type { OAuthOptions, Scope } from "./types";

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
		oauthProviderConfig?: Omit<
			OAuthOptions<Scope[]>,
			"loginPage" | "consentPage"
		>;
		jwtConfig?: JwtOptions;
		advanced?: BetterAuthOptions["advanced"];
	}) {
		const { auth, customFetchImpl } = await getTestInstance({
			baseURL: authServerBaseUrl,
			...(opts?.advanced ? { advanced: opts.advanced } : {}),
			plugins: [
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
					allowDynamicClientRegistration: true,
					...opts?.oauthProviderConfig,
				}),
				...(opts?.oauthProviderConfig?.disableJwtPlugin
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
			auth,
			client: unauthenticatedClient,
			customFetchImpl,
		};
	}

	it("should get openid, equivalent auth server", async () => {
		const { auth } = await createTestInstance();
		const metadata = await auth.api.getOpenIdConfig();
		expect(metadata).toMatchObject({
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
			authorization_response_iss_parameter_supported: true,
			claims_supported: baseClaims,
			userinfo_endpoint: `${baseURL}/oauth2/userinfo`,
			subject_types_supported: ["public"],
			id_token_signing_alg_values_supported: ["EdDSA"],
			end_session_endpoint: `${baseURL}/oauth2/end-session`,
			acr_values_supported: ["urn:mace:incommon:iap:bronze"],
			prompt_values_supported: [
				"login",
				"consent",
				"create",
				"select_account",
				"none",
			],
		});
		const oauthMetadata = await auth.api.getOAuthServerConfig();
		expect(oauthMetadata).toMatchObject(metadata ?? {});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8343
	 */
	it("should serve authorization server metadata at the issuer-appended well-known URL", async () => {
		const { customFetchImpl } = await createTestInstance();
		const response = await customFetchImpl(
			`${baseURL}/.well-known/oauth-authorization-server`,
			{ method: "GET" },
		);

		expect(response.status).toBe(200);
		const metadata = (await response.json()) as { issuer: string };
		expect(metadata.issuer).toBe(baseURL);
	});

	it("should serve authorization server metadata at the RFC 8414 path-insertion URL", async () => {
		const { customFetchImpl } = await createTestInstance();
		const response = await customFetchImpl(
			`${authServerBaseUrl}/.well-known/oauth-authorization-server/api/auth`,
			{ method: "GET" },
		);

		expect(response.status).toBe(200);
		const metadata = (await response.json()) as { issuer: string };
		expect(metadata.issuer).toBe(baseURL);
	});

	it("should advertise dynamic client registration from direct OAuth metadata when enabled", async () => {
		const { customFetchImpl } = await createTestInstance({
			oauthProviderConfig: {
				scopes: ["create:test"],
				allowDynamicClientRegistration: true,
			},
		});
		const response = await customFetchImpl(
			`${baseURL}/.well-known/oauth-authorization-server`,
			{ method: "GET" },
		);

		expect(response.status).toBe(200);
		const metadata = (await response.json()) as {
			registration_endpoint?: string;
		};
		expect(metadata.registration_endpoint).toBe(`${baseURL}/oauth2/register`);
	});

	it("should serve OIDC metadata at the direct issuer well-known URL", async () => {
		const { customFetchImpl } = await createTestInstance();
		const response = await customFetchImpl(
			`${baseURL}/.well-known/openid-configuration`,
			{ method: "GET" },
		);

		expect(response.status).toBe(200);
		const metadata = (await response.json()) as { issuer: string };
		expect(metadata.issuer).toBe(baseURL);
	});

	it("should restrict direct metadata requests to GET and HEAD", async () => {
		const { customFetchImpl } = await createTestInstance();
		const issuerAppendedAuthServerMetadataURL = `${baseURL}/.well-known/oauth-authorization-server`;
		const pathInsertionAuthServerMetadataURL = `${authServerBaseUrl}/.well-known/oauth-authorization-server/api/auth`;
		const openIdConfigURL = `${baseURL}/.well-known/openid-configuration`;

		for (const url of [
			issuerAppendedAuthServerMetadataURL,
			pathInsertionAuthServerMetadataURL,
		]) {
			const headResponse = await customFetchImpl(url, {
				method: "HEAD",
			});
			expect(headResponse.status).toBe(200);
			expect(await headResponse.text()).toBe("");
		}

		for (const url of [
			issuerAppendedAuthServerMetadataURL,
			pathInsertionAuthServerMetadataURL,
			openIdConfigURL,
		]) {
			const response = await customFetchImpl(url, { method: "POST" });
			expect(response.status).toBe(405);
			expect(response.headers.get("Allow")).toBe("GET, HEAD");
		}
	});

	it("should only skip trailing slashes when configured", async () => {
		const authServerMetadataURL = `${authServerBaseUrl}/.well-known/oauth-authorization-server/api/auth/`;
		const { customFetchImpl } = await createTestInstance();
		const response = await customFetchImpl(authServerMetadataURL, {
			method: "GET",
		});

		expect(response.status).toBe(404);

		const { customFetchImpl: customFetchImplWithSkipTrailingSlashes } =
			await createTestInstance({
				advanced: {
					skipTrailingSlashes: true,
				},
			});
		const skipTrailingSlashesResponse =
			await customFetchImplWithSkipTrailingSlashes(authServerMetadataURL, {
				method: "GET",
			});

		expect(skipTrailingSlashesResponse.status).toBe(200);
		const metadata = (await skipTrailingSlashesResponse.json()) as {
			issuer: string;
		};
		expect(metadata.issuer).toBe(baseURL);
	});

	it("should not have an openid-configuration, has auth server configuration", async () => {
		const scopes = ["create:test"];
		const { auth } = await createTestInstance({
			oauthProviderConfig: {
				scopes,
			},
		});
		await expect(auth.api.getOpenIdConfig()).rejects.toThrowError(APIError);
		const oauthMetadata = await auth.api.getOAuthServerConfig();
		expect(oauthMetadata).toMatchObject({
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
			authorization_response_iss_parameter_supported: true,
		});
	});

	it("should not provide dynamic client registration endpoint when disabled", async () => {
		const { auth } = await createTestInstance({
			oauthProviderConfig: {
				allowDynamicClientRegistration: false,
			},
		});
		const metadata = await auth.api.getOpenIdConfig();
		expect(metadata.registration_endpoint).toBeUndefined();
		const oauthMetadata = await auth.api.getOAuthServerConfig();
		expect(oauthMetadata.registration_endpoint).toBeUndefined();
	});

	it("should not provide dynamic client registration endpoint when undefined", async () => {
		const { auth } = await createTestInstance({
			oauthProviderConfig: {
				allowDynamicClientRegistration: undefined,
			},
		});
		const metadata = await auth.api.getOpenIdConfig();
		expect(metadata.registration_endpoint).toBeUndefined();
		const oauthMetadata = await auth.api.getOAuthServerConfig();
		expect(oauthMetadata.registration_endpoint).toBeUndefined();
	});

	it("should utilize advertised metadata fields", async () => {
		const advertisedScopes = ["email"];
		const advertisedClaims = ["sub", "iss", "aud", "exp", "iat", "scope"];
		const { auth } = await createTestInstance({
			oauthProviderConfig: {
				advertisedMetadata: {
					scopes_supported: advertisedScopes,
					claims_supported: advertisedClaims,
				},
			},
		});
		const metadata = await auth.api.getOpenIdConfig();
		expect(metadata).toMatchObject({
			scopes_supported: advertisedScopes,
			claims_supported: advertisedClaims,
		});
		const oauthMetadata = await auth.api.getOAuthServerConfig();
		expect(oauthMetadata).toMatchObject(metadata ?? {});
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
						silenceWarnings: {
							oauthAuthServerConfig: true,
							openidConfig: true,
						},
					}),
					jwt(),
				],
			}),
		).toThrowError(
			"advertisedMetadata.scopes_supported create:test not found in scopes",
		);
	});

	it("should advertise custom claims", async () => {
		const customClaims = ["http://example.com/roles"];
		const { auth } = await createTestInstance({
			oauthProviderConfig: {
				advertisedMetadata: {
					claims_supported: [...baseClaims, ...customClaims],
				},
			},
		});
		const metadata = await auth.api.getOpenIdConfig();
		expect(metadata).toMatchObject({
			claims_supported: [...baseClaims, ...customClaims],
		});
		const oauthMetadata = await auth.api.getOAuthServerConfig();
		expect(oauthMetadata).toMatchObject(metadata ?? {});
	});

	it("should use the remoteJwks url", async () => {
		const remoteUrl = "http://example.com/.well-known/openid-configuration";
		const alg = "ES256";
		const { auth } = await createTestInstance({
			jwtConfig: {
				jwks: {
					remoteUrl,
					keyPairConfig: {
						alg,
					},
				},
			},
		});
		const metadata = await auth.api.getOpenIdConfig();
		expect(metadata).toMatchObject({
			jwks_uri: remoteUrl,
			id_token_signing_alg_values_supported: [alg],
		});
		const oauthMetadata = await auth.api.getOAuthServerConfig();
		expect(oauthMetadata).toMatchObject(metadata ?? {});
	});

	it("should support disableJwtPlugin", async () => {
		const { auth } = await createTestInstance({
			oauthProviderConfig: {
				disableJwtPlugin: true,
			},
		});
		const metadata = await auth.api.getOpenIdConfig();
		expect(metadata).toMatchObject({
			id_token_signing_alg_values_supported: ["HS256"],
		});
		const oauthMetadata = await auth.api.getOAuthServerConfig();
		expect(oauthMetadata).toMatchObject(metadata ?? {});
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/9105
 */
describe("dynamic baseURL metadata wrappers", async () => {
	const host = "tenant.example.com";
	const expectedBaseURL = `https://${host}/api/auth`;

	// Fallback is required because `getTestInstance` internally invokes
	// `signUpEmail` with no Request during setup.
	const { auth } = await getTestInstance({
		baseURL: {
			allowedHosts: [host],
			protocol: "https",
			fallback: "https://fallback.example.com",
		},
		plugins: [
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
			jwt(),
		],
	});

	it("oauthProviderAuthServerMetadata resolves baseURL from the incoming request", async () => {
		const request = new Request(
			`https://${host}/.well-known/oauth-authorization-server`,
		);
		const response = await oauthProviderAuthServerMetadata(auth)(request);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { issuer: string };
		expect(body.issuer).toBe(expectedBaseURL);
	});

	it("oauthProviderOpenIdConfigMetadata resolves baseURL from the incoming request", async () => {
		const request = new Request(
			`https://${host}/.well-known/openid-configuration`,
		);
		const response = await oauthProviderOpenIdConfigMetadata(auth)(request);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { issuer: string };
		expect(body.issuer).toBe(expectedBaseURL);
	});
});

describe("oauth resource metadata", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const validAudience = "https://myapi.example.com";
	const supportedScopes = [
		"openid",
		"profile",
		"email",
		"offline_access",
		"read:posts",
	];
	const { auth, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt({
				jwt: {
					issuer: authServerBaseUrl,
				},
			}),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				validAudiences: [validAudience],
				scopes: supportedScopes,
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
		],
	});

	const authClient = createAuthClient({
		plugins: [oauthProviderResourceClient(auth)],
		baseURL: authServerBaseUrl,
		fetchOptions: {
			customFetchImpl,
		},
	});

	it("should provide resource discovery configuration", async () => {
		const metadata = await authClient.getProtectedResourceMetadata({
			resource: validAudience,
		});
		expect(metadata).toMatchObject({
			resource: validAudience, // aud
			authorization_servers: [authServerBaseUrl], // iss
		});
	});

	it("should allow overwriting any field", async () => {
		const anotherIssuer = "https://admin.example.com";
		const anotherResource = "https://another-api.example.com";
		const metadata = await authClient.getProtectedResourceMetadata({
			resource: anotherResource,
			authorization_servers: [anotherIssuer],
		});
		expect(metadata).toMatchObject({
			resource: anotherResource,
			authorization_servers: [anotherIssuer],
		});
	});

	it("should not support 'openid' scope", async () => {
		await expect(
			authClient.getProtectedResourceMetadata({
				resource: validAudience,
				scopes_supported: ["openid"],
			}),
		).rejects.toThrowError(BetterAuthError);
	});

	it("should pass with supported scopes", async () => {
		const metadata = await authClient.getProtectedResourceMetadata({
			resource: validAudience,
			scopes_supported: ["read:posts"],
		});
		expect(metadata).toMatchObject({
			resource: validAudience,
			authorization_servers: [authServerBaseUrl],
			scopes_supported: ["read:posts"],
		});
	});

	it("should fail unsupported scope", async () => {
		await expect(
			authClient.getProtectedResourceMetadata({
				resource: validAudience,
				scopes_supported: ["write:posts"],
			}),
		).rejects.toThrowError(BetterAuthError);
	});

	it("should pass with externally available scopes", async () => {
		const anotherAuthorizationServer = "https://auth.example.com";
		const metadata = await authClient.getProtectedResourceMetadata(
			{
				resource: validAudience,
				authorization_servers: [authServerBaseUrl, anotherAuthorizationServer],
				scopes_supported: ["read:posts", "write:posts"],
			},
			{
				externalScopes: ["write:posts"],
			},
		);
		expect(metadata).toMatchObject({
			resource: validAudience,
			authorization_servers: [authServerBaseUrl, anotherAuthorizationServer],
			scopes_supported: ["read:posts", "write:posts"],
		});
	});
});
