import { describe, it, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { jwt, type JwtOptions } from "../jwt";
import { oauthProvider } from "./oauth";
import { oauthProviderProtectedResourceMetadata } from "./metadata";
import { BetterAuthError } from "@better-auth/core/error";
import { createAuthClient } from "../../client";
import type { OAuthOptions } from "./types";
import type { ResourceServerMetadata } from "../../oauth-2.1/types";
import { oauthProviderClient } from "./client";
import { APIError } from "better-call";

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
		const { auth, customFetchImpl } = await getTestInstance({
			baseURL: authServerBaseUrl,
			plugins: [
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
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
			claims_supported: baseClaims,
			userinfo_endpoint: `${baseURL}/oauth2/userinfo`,
			subject_types_supported: ["public"],
			id_token_signing_alg_values_supported: ["EdDSA"],
			acr_values_supported: ["urn:mace:incommon:iap:bronze"],
		});
		const oauthMetadata = await auth.api.getOAuthServerConfig();
		expect(oauthMetadata).toMatchObject(metadata ?? {});
	});

	it("should not have an openid-configuration, has auth server configuration", async () => {
		const scopes = ["create:test"];
		const { auth } = await createTestInstance({
			oauthProviderConfig: {
				scopes,
			},
		});
		await expect(auth.api.getOpenIdConfig()).rejects.toThrowError(
			new APIError("NOT_FOUND"),
		);
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
		});
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
		const { auth } = await createTestInstance({
			oauthProviderConfig: {
				customClaims: customClaims,
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

describe("metadata - resource discovery functions", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const validAudience = "https://myapi.example.com";
	const supportedScopes = [
		"openid",
		"profile",
		"email",
		"offline_access",
		"read:posts",
	];
	const { auth } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt({
				jwt: {
					audience: validAudience,
					issuer: authServerBaseUrl,
				},
			}),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				scopes: supportedScopes,
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
		],
	});

	it("should provide resource discovery configuration", async () => {
		const metadata = await auth.api.getOAuthProtectedResourceConfig();
		expect(metadata).toMatchObject({
			resource: validAudience, // aud
			authorization_servers: [authServerBaseUrl], // iss
		});
	});

	it("should allow overwriting any field", async () => {
		const anotherIssuer = "https://admin.example.com";
		const anotherResource = "https://another-api.example.com";
		const metadata = await auth.api.getOAuthProtectedResourceConfig({
			body: {
				overrides: {
					resource: anotherResource,
					authorization_servers: [anotherIssuer],
				},
			},
		});
		expect(metadata).toMatchObject({
			resource: anotherResource,
			authorization_servers: [anotherIssuer],
		});
	});

	it("oauthProviderProtectedResourceMetadata - should pass without opts providing resource discovery configuration", async () => {
		// @ts-expect-error Full auth not provided
		const metadataEndpoint = oauthProviderProtectedResourceMetadata(auth);
		const metadataRes = await metadataEndpoint(
			new Request("http://localhost/.well-known/oauth-protected-resource", {
				method: "GET",
			}),
		);
		expect(metadataRes.ok).toBeTruthy();
		const metadata: ResourceServerMetadata = await metadataRes.json();
		expect(metadata).toMatchObject({
			resource: validAudience, // aud
			authorization_servers: [authServerBaseUrl], // iss
		});
	});

	it("oauthProviderProtectedResourceMetadata - should not support 'openid' scope", async () => {
		try {
			// @ts-expect-error Full auth not provided
			oauthProviderProtectedResourceMetadata(auth, {
				overrides: {
					scopes_supported: ["openid"],
				},
			});
			expect.unreachable();
		} catch (error) {
			expect(error instanceof BetterAuthError).toBeTruthy();
		}
	});

	it("oauthProviderProtectedResourceMetadata - should pass with supported scopes", async () => {
		// @ts-expect-error Full auth not provided
		const metadataEndpoint = oauthProviderProtectedResourceMetadata(auth, {
			overrides: {
				scopes_supported: ["read:posts"],
			},
		});
		const metadataRes = await metadataEndpoint(
			new Request("http://localhost/.well-known/oauth-protected-resource", {
				method: "GET",
			}),
		);
		expect(metadataRes.ok).toBeTruthy();
		const metadata: ResourceServerMetadata = await metadataRes.json();
		expect(metadata).toMatchObject({
			resource: validAudience, // aud
			authorization_servers: [authServerBaseUrl], // iss
			scopes_supported: ["read:posts"],
		});
	});

	it("oauthProviderProtectedResourceMetadata - should fail unsupported scope", async () => {
		try {
			// @ts-expect-error Full auth not provided
			oauthProviderProtectedResourceMetadata(auth, {
				overrides: {
					scopes_supported: ["write:posts"],
				},
			});
			expect.unreachable();
		} catch (error) {
			expect(error instanceof BetterAuthError).toBeTruthy();
		}
	});

	it("oauthProviderProtectedResourceMetadata - should pass externally available scopes", async () => {
		// @ts-expect-error Full auth not provided
		const metadataEndpoint = oauthProviderProtectedResourceMetadata(auth, {
			externalScopes: ["write:posts"],
			overrides: {
				authorization_servers: [
					authServerBaseUrl,
					"https://another.example.com",
				],
				scopes_supported: ["read:posts", "write:posts"],
			},
		});
		const metadataRes = await metadataEndpoint(
			new Request("http://localhost/.well-known/oauth-protected-resource", {
				method: "GET",
			}),
		);
		expect(metadataRes.ok).toBeTruthy();
		const metadata: ResourceServerMetadata = await metadataRes.json();
		expect(metadata).toMatchObject({
			resource: validAudience, // aud
			authorization_servers: [
				authServerBaseUrl, // iss
				"https://another.example.com",
			],
			scopes_supported: ["read:posts", "write:posts"],
		});
	});
});
