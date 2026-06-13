import { APIError } from "better-auth/api";
import { createAuthClient } from "better-auth/client";
import { CLIENT_ASSERTION_TYPE } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { BetterAuthPlugin, User } from "better-auth/types";
import { decodeJwt } from "jose";
import { describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import {
	extendOAuthProvider,
	validateOAuthProviderExtensions,
} from "./extensions";
import { oauthProvider } from "./oauth";
import type {
	ClientDiscovery,
	OAuthProviderExtension,
	SchemaClient,
	Scope,
} from "./types";
import { validateClientCredentials } from "./utils";

describe("oauth-provider extensions", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const resource = "https://vc.example.com/credential";
	const redirectUri = "https://client.example.com/callback";
	const extensionGrant = "urn:better-auth:test:grant";
	const extensionAuthMethod = "test_attestation_jwt";
	const extensionAssertionType =
		"urn:better-auth:test:client-assertion-type:test-attestation";
	let grantUser: User | undefined;
	let observedCustomParam: string | undefined;
	const clientDiscovery = {
		id: "test-client-discovery",
		matches: () => false,
		resolve: () => null,
		discoveryMetadata: {
			issuer: "https://malicious-discovery.example.com",
			token_endpoint: "https://malicious-discovery.example.com/token",
			client_id_metadata_document_supported: true,
		},
	} satisfies ClientDiscovery<Scope[]>;

	const extensionPlugin = {
		id: "test-oauth-extension",
		init(ctx) {
			extendOAuthProvider(ctx, {
				grants: {
					[extensionGrant]: async ({ ctx, grantType, tools }) => {
						observedCustomParam = (ctx.body as { custom_param?: string })
							.custom_param;
						if (!grantUser) {
							throw new APIError("BAD_REQUEST", {
								error: "invalid_request",
								error_description: "test user is not ready",
							});
						}
						const { client } = await tools.authenticateClient({
							scopes: ["openid", "email", "vc"],
							grantType,
						});
						return tools.issueTokens({
							client,
							scopes: ["openid", "email", "vc"],
							grantType,
							user: grantUser,
							resources: [resource],
							extra: {
								accessTokenClaims: {
									grant_claim: "grant-access",
									client_id: "malicious-client",
								},
								idTokenClaims: {
									grant_id_claim: "grant-id",
									sub: "malicious-sub",
								},
								tokenResponse: {
									issued_token_type: "urn:better-auth:test:access_token",
								},
							},
						});
					},
				},
				clientAuthentication: {
					[extensionAuthMethod]: {
						assertionTypes: [extensionAssertionType],
						authenticate: async ({ ctx, assertion, clientId }) => {
							if (!clientId || assertion !== `assertion:${clientId}`) {
								throw new APIError("UNAUTHORIZED", {
									error: "invalid_client",
									error_description: "invalid test assertion",
								});
							}
							const client = await ctx.context.adapter.findOne<
								SchemaClient<Scope[]>
							>({
								model: "oauthClient",
								where: [{ field: "clientId", value: clientId }],
							});
							if (!client) {
								throw new APIError("BAD_REQUEST", {
									error: "invalid_client",
									error_description: "missing client",
								});
							}
							return { clientId, client };
						},
					},
				},
				metadata: () => ({
					issuer: "https://malicious.example.com",
					credential_issuer: "https://vc.example.com",
				}),
				claims: {
					accessToken: () => ({
						extension_access_claim: "extension-access",
						client_id: "malicious-extension-client",
					}),
					idToken: () => ({
						extension_id_claim: "extension-id",
						sub: "malicious-extension-sub",
					}),
					userInfo: () => ({
						extension_userinfo_claim: "extension-userinfo",
						email: undefined,
						sub: "malicious-extension-sub",
					}),
				},
			});
		},
	} satisfies BetterAuthPlugin;

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
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
				clientDiscovery,
				resources: [resource],
				enforcePerClientResources: false,
				allowDynamicClientRegistration: true,
				scopes: ["openid", "profile", "email", "offline_access", "vc"],
				customUserInfoClaims: () => ({
					custom_userinfo_claim: "custom-userinfo",
					sub: "malicious-custom-sub",
				}),
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
			extensionPlugin,
		],
	});
	const { headers, user } = await signInWithTestUser();
	grantUser = user;
	const client = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: authServerBaseUrl,
		fetchOptions: {
			customFetchImpl,
		},
	});

	it("advertises extension metadata without overriding core metadata", async () => {
		const metadata = (await auth.api.getOpenIdConfig()) as unknown as Record<
			string,
			unknown
		>;
		expect(metadata.issuer).toBe(authServerBaseUrl);
		expect(metadata.token_endpoint).not.toBe(
			"https://malicious-discovery.example.com/token",
		);
		expect(metadata.credential_issuer).toBe("https://vc.example.com");
		expect(metadata.client_id_metadata_document_supported).toBe(true);
		expect(metadata.grant_types_supported).toContain(extensionGrant);
		expect(metadata.token_endpoint_auth_methods_supported).toContain(
			extensionAuthMethod,
		);
		expect(metadata.introspection_endpoint_auth_methods_supported).toContain(
			extensionAuthMethod,
		);
		expect(metadata.revocation_endpoint_auth_methods_supported).toContain(
			extensionAuthMethod,
		);
	});

	it("registers extension grants and auth methods through normal client creation", async () => {
		const adminClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: extensionAuthMethod,
				grant_types: [extensionGrant],
				scope: "openid email vc",
				type: "web",
			},
		});
		expect(adminClient?.client_id).toBeDefined();
		expect(adminClient?.client_secret).toBeUndefined();
		expect(adminClient?.token_endpoint_auth_method).toBe(extensionAuthMethod);
		expect(adminClient?.grant_types).toEqual([extensionGrant]);
		expect(adminClient?.redirect_uris).toEqual([]);
		expect(adminClient?.response_types).toBeUndefined();

		const registeredClient = await auth.api.registerOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: extensionAuthMethod,
				grant_types: [extensionGrant],
				scope: "openid email vc",
				type: "web",
			},
		});
		expect(registeredClient?.client_id).toBeDefined();
		expect(registeredClient?.client_secret).toBeUndefined();
		expect(registeredClient?.token_endpoint_auth_method).toBe(
			extensionAuthMethod,
		);
		expect(registeredClient?.redirect_uris).toEqual([]);
		expect(registeredClient?.response_types).toBeUndefined();
	});

	it("rejects code response type without authorization code grant", async () => {
		let error: unknown;
		try {
			await auth.api.adminCreateOAuthClient({
				headers,
				body: {
					token_endpoint_auth_method: extensionAuthMethod,
					grant_types: [extensionGrant],
					response_types: ["code"],
					scope: "openid email vc",
					type: "web",
				},
			});
		} catch (e) {
			error = e;
		}
		expect((error as { statusCode?: number } | undefined)?.statusCode).toBe(
			400,
		);
		expect(
			(error as { body?: { error_description?: string } } | undefined)?.body
				?.error_description,
		).toContain("authorization_code");
	});

	it("rejects empty grant type registration", async () => {
		const response = await client.$fetch("/oauth2/register", {
			method: "POST",
			headers,
			body: {
				grant_types: [],
				redirect_uris: [redirectUri],
			},
		});
		expect(response.error?.status).toBe(400);
	});

	it("rejects assertion auth for legacy clients with omitted auth method", async () => {
		const legacyClient = {
			clientId: "legacy-default-client",
			public: false,
		} as SchemaClient<Scope[]>;
		await expect(
			validateClientCredentials(
				{} as Parameters<typeof validateClientCredentials>[0],
				{} as Parameters<typeof validateClientCredentials>[1],
				legacyClient.clientId,
				undefined,
				undefined,
				legacyClient,
				undefined,
				extensionAuthMethod,
			),
		).rejects.toMatchObject({
			statusCode: 400,
			body: {
				error: "invalid_client",
				error_description: `client registered for client_secret_basic cannot use ${extensionAuthMethod}`,
			},
		});
	});

	it("rejects invalid direct extension options during provider setup", () => {
		expect(() =>
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				extensions: [
					{
						grants: {
							password: async () => {
								throw new APIError("BAD_REQUEST", {
									error: "invalid_request",
									error_description: "unreachable test grant",
								});
							},
						},
					},
				],
			}),
		).toThrow("grant type must be an absolute URI");
	});

	it("does not revalidate extension objects after setup", () => {
		let grantsReadCount = 0;
		const extension = {
			get grants() {
				grantsReadCount++;
				return {
					[extensionGrant]: async () => {
						throw new APIError("BAD_REQUEST", {
							error: "invalid_request",
							error_description: "unreachable test grant",
						});
					},
				};
			},
		} satisfies OAuthProviderExtension<Scope[]>;
		validateOAuthProviderExtensions([extension]);
		validateOAuthProviderExtensions([extension]);
		expect(grantsReadCount).toBe(1);
	});

	it("dispatches extension grants through shared token issuance", async () => {
		const oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [`${redirectUri}/token`],
				token_endpoint_auth_method: extensionAuthMethod,
				grant_types: [extensionGrant],
				scope: "openid email vc",
				type: "web",
			},
		});
		expect(oauthClient?.client_id).toBeDefined();

		const tokenResponse = await client.$fetch<{
			access_token: string;
			id_token: string;
			issued_token_type: string;
			scope: string;
		}>("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: extensionGrant,
				client_id: oauthClient!.client_id,
				client_assertion_type: extensionAssertionType,
				client_assertion: `assertion:${oauthClient!.client_id}`,
				custom_param: "preserved",
				resource,
			}),
			headers: {
				"content-type": "application/x-www-form-urlencoded",
			},
		});
		expect(tokenResponse.error).toBeNull();
		expect(tokenResponse.data?.issued_token_type).toBe(
			"urn:better-auth:test:access_token",
		);
		expect(tokenResponse.data?.scope).toBe("openid email vc");
		expect(observedCustomParam).toBe("preserved");

		const accessTokenPayload = decodeJwt(tokenResponse.data!.access_token);
		expect(accessTokenPayload.extension_access_claim).toBe("extension-access");
		expect(accessTokenPayload.grant_claim).toBe("grant-access");
		expect(accessTokenPayload.client_id).toBe(oauthClient!.client_id);
		expect(accessTokenPayload.aud).toContain(resource);

		const idTokenPayload = decodeJwt(tokenResponse.data!.id_token);
		expect(idTokenPayload.extension_id_claim).toBe("extension-id");
		expect(idTokenPayload.grant_id_claim).toBe("grant-id");
		expect(idTokenPayload.sub).toBe(user.id);

		const userInfo = await client.$fetch<Record<string, unknown>>(
			"/oauth2/userinfo",
			{
				headers: {
					authorization: `Bearer ${tokenResponse.data!.access_token}`,
				},
			},
		);
		expect(userInfo.error).toBeNull();
		expect(userInfo.data?.sub).toBe(user.id);
		expect(userInfo.data?.email).toBe(user.email);
		expect(userInfo.data?.extension_userinfo_claim).toBe("extension-userinfo");
		expect(userInfo.data?.custom_userinfo_claim).toBe("custom-userinfo");

		const introspection = await client.$fetch<Record<string, unknown>>(
			"/oauth2/introspect",
			{
				method: "POST",
				body: new URLSearchParams({
					token: tokenResponse.data!.access_token,
					client_id: oauthClient!.client_id,
					client_assertion_type: extensionAssertionType,
					client_assertion: `assertion:${oauthClient!.client_id}`,
				}),
				headers: {
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(introspection.error).toBeNull();
		expect(introspection.data?.active).toBe(true);
		expect(introspection.data?.extension_access_claim).toBe("extension-access");
	});

	it("rejects unsupported extension grant types before credential handling", async () => {
		const response = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: "urn:better-auth:test:missing-grant",
			}),
			headers: {
				"content-type": "application/x-www-form-urlencoded",
			},
		});
		expect(response.error?.status).toBe(400);
		expect((response.error as { error?: string } | undefined)?.error).toBe(
			"unsupported_grant_type",
		);
	});

	it("rejects extension grant keys that are not absolute URIs", async () => {
		const invalidExtensionPlugin = {
			id: "invalid-oauth-extension",
			init(ctx) {
				extendOAuthProvider(ctx, {
					grants: {
						custom: async () => {
							throw new APIError("BAD_REQUEST", {
								error: "invalid_request",
								error_description: "unreachable test grant",
							});
						},
					},
				});
			},
		} satisfies BetterAuthPlugin;
		await expect(
			getTestInstance({
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
						silenceWarnings: {
							oauthAuthServerConfig: true,
							openidConfig: true,
						},
					}),
					invalidExtensionPlugin,
				],
			}),
		).rejects.toThrow("grant type must be an absolute URI");
	});

	it("rejects extension auth method keys reserved by built-in client authentication", async () => {
		const invalidExtensionPlugin = {
			id: "invalid-oauth-auth-method-extension",
			init(ctx) {
				extendOAuthProvider(ctx, {
					clientAuthentication: {
						private_key_jwt: {
							assertionTypes: [extensionAssertionType],
							authenticate: async () => {
								throw new APIError("BAD_REQUEST", {
									error: "invalid_request",
									error_description: "unreachable test authentication",
								});
							},
						},
					},
				});
			},
		} satisfies BetterAuthPlugin;
		await expect(
			getTestInstance({
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
						silenceWarnings: {
							oauthAuthServerConfig: true,
							openidConfig: true,
						},
					}),
					invalidExtensionPlugin,
				],
			}),
		).rejects.toThrow(
			"token_endpoint_auth_method is reserved: private_key_jwt",
		);
	});

	it("rejects extension assertion types reserved by private_key_jwt", async () => {
		const invalidExtensionPlugin = {
			id: "invalid-oauth-assertion-type-extension",
			init(ctx) {
				extendOAuthProvider(ctx, {
					clientAuthentication: {
						[extensionAuthMethod]: {
							assertionTypes: [CLIENT_ASSERTION_TYPE],
							authenticate: async () => {
								throw new APIError("BAD_REQUEST", {
									error: "invalid_request",
									error_description: "unreachable test authentication",
								});
							},
						},
					},
				});
			},
		} satisfies BetterAuthPlugin;
		await expect(
			getTestInstance({
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
						silenceWarnings: {
							oauthAuthServerConfig: true,
							openidConfig: true,
						},
					}),
					invalidExtensionPlugin,
				],
			}),
		).rejects.toThrow(
			`client_assertion_type is reserved: ${CLIENT_ASSERTION_TYPE}`,
		);
	});

	it("rejects extension auth methods without assertion types", async () => {
		const invalidExtensionPlugin = {
			id: "invalid-oauth-empty-assertion-types-extension",
			init(ctx) {
				extendOAuthProvider(ctx, {
					clientAuthentication: {
						[extensionAuthMethod]: {
							assertionTypes: [],
							authenticate: async () => {
								throw new APIError("BAD_REQUEST", {
									error: "invalid_request",
									error_description: "unreachable test authentication",
								});
							},
						},
					},
				});
			},
		} satisfies BetterAuthPlugin;
		await expect(
			getTestInstance({
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
						silenceWarnings: {
							oauthAuthServerConfig: true,
							openidConfig: true,
						},
					}),
					invalidExtensionPlugin,
				],
			}),
		).rejects.toThrow("client_assertion_type list cannot be empty");
	});
});
