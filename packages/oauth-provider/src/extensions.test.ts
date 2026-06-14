import { APIError } from "better-auth/api";
import { createAuthClient } from "better-auth/client";
import { CLIENT_ASSERTION_TYPE } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { BetterAuthPlugin, User } from "better-auth/types";
import { decodeJwt } from "jose";
import { describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { extendOAuthProvider } from "./extensions";
import { oauthProvider } from "./oauth";
import type {
	ClientDiscovery,
	OAuthProviderExtension,
	SchemaClient,
	Scope,
} from "./types";
import { validateClientCredentials } from "./utils";
import { consumeClientAssertion } from "./utils/client-assertion";

describe("oauth-provider extensions", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const resource = "https://vc.example.com/credential";
	const redirectUri = "https://client.example.com/callback";
	const extensionGrant = "urn:better-auth:test:grant";
	const extensionOpaqueGrant = "urn:better-auth:test:opaque-grant";
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
	} satisfies ClientDiscovery;

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
							user: grantUser,
							resources: [resource],
							accessTokenClaims: {
								grant_claim: "grant-access",
								client_id: "malicious-client",
							},
							idTokenClaims: {
								grant_id_claim: "grant-id",
								sub: "malicious-sub",
								// Collides with the extension idToken contributor below;
								// the per-issuance value must win.
								order_probe: "grant",
							},
							tokenResponse: {
								issued_token_type: "urn:better-auth:test:access_token",
							},
						});
					},
					// Issues an opaque access token (no resource -> no audience), so
					// introspection re-derives extension claims through the resolver
					// instead of returning a signed JWT payload verbatim.
					[extensionOpaqueGrant]: async ({ grantType, tools }) => {
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
							user: grantUser,
							// Per-issuance claims are JWT-only; an opaque token persists
							// none, so this must be absent at introspection.
							accessTokenClaims: { opaque_per_issuance: "jwt-only" },
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
						email: "evil@malicious.example",
						order_probe: "extension",
					}),
					userInfo: () => ({
						extension_userinfo_claim: "extension-userinfo",
						email: undefined,
						sub: "malicious-extension-sub",
					}),
				},
				clientDiscovery,
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
				resources: [resource],
				enforcePerClientResources: false,
				allowDynamicClientRegistration: true,
				scopes: ["openid", "profile", "email", "offline_access", "vc"],
				customUserInfoClaims: () => ({
					custom_userinfo_claim: "custom-userinfo",
					// Re-pinned by the endpoint; proves first-party cannot move `sub`.
					sub: "malicious-custom-sub",
					// First-party config MAY override a provider base claim (unlike a
					// third-party extension): the response must reflect this value.
					email_verified: true,
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

	it("validates jwks_uri for extension auth-method clients", async () => {
		let error: unknown;
		try {
			await auth.api.adminCreateOAuthClient({
				headers,
				body: {
					token_endpoint_auth_method: extensionAuthMethod,
					grant_types: [extensionGrant],
					jwks_uri: "https://127.0.0.1/jwks",
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
		).toContain("private or reserved address");
	});

	it("rejects extension auth-method clients carrying both jwks and jwks_uri", async () => {
		let error: unknown;
		try {
			await auth.api.adminCreateOAuthClient({
				headers,
				body: {
					token_endpoint_auth_method: extensionAuthMethod,
					grant_types: [extensionGrant],
					jwks: [{ kty: "RSA", n: "test", e: "test-exponent" }],
					jwks_uri: "https://client.example.com/jwks",
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
		).toContain("mutually exclusive");
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

	it("registers an extension at most once per extension object", () => {
		const provider = oauthProvider({
			loginPage: "/login",
			consentPage: "/consent",
		});
		const ctx = {
			getPlugin: (id: string) => (id === "oauth-provider" ? provider : null),
		} as unknown as Parameters<typeof extendOAuthProvider>[0];
		const extension = {
			grants: {
				[extensionGrant]: async () => {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_request",
						error_description: "unreachable test grant",
					});
				},
			},
		} satisfies OAuthProviderExtension;
		extendOAuthProvider(ctx, extension);
		// A re-run of the plugin's init() (for example when one factory result is
		// shared across two betterAuth() instances) must not append the extension
		// again, which would otherwise reject as a duplicate grant type.
		extendOAuthProvider(ctx, extension);
		expect(
			(provider.options as { extensions?: unknown[] }).extensions,
		).toHaveLength(1);
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
		// Extension id-token claims are additive: they cannot replace the user's
		// identity claims.
		expect(idTokenPayload.email).toBe(user.email);
		expect(idTokenPayload.email).not.toBe("evil@malicious.example");
		// Per-issuance idTokenClaims win a collision against an extension idToken
		// contributor (extension < per-issuance), matching the access-token ladder.
		expect(idTokenPayload.order_probe).toBe("grant");

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
		// First-party customUserInfoClaims may override a provider base claim,
		// unlike an additive third-party extension claim. `sub` stays re-pinned.
		expect(userInfo.data?.email_verified).toBe(true);

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

	it("rejects two extensions registering the same grant type", async () => {
		const sharedGrant = "urn:better-auth:test:shared-grant";
		const makeExtensionPlugin = (id: string) =>
			({
				id,
				init(ctx) {
					extendOAuthProvider(ctx, {
						grants: {
							[sharedGrant]: async () => {
								throw new APIError("BAD_REQUEST", {
									error: "invalid_request",
									error_description: "unreachable test grant",
								});
							},
						},
					});
				},
			}) satisfies BetterAuthPlugin;
		await expect(
			getTestInstance({
				baseURL: authServerBaseUrl,
				plugins: [
					jwt({ jwt: { issuer: authServerBaseUrl } }),
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						silenceWarnings: {
							oauthAuthServerConfig: true,
							openidConfig: true,
						},
					}),
					makeExtensionPlugin("ext-a"),
					makeExtensionPlugin("ext-b"),
				],
			}),
		).rejects.toThrow("register grant type");
	});

	it("rejects two extensions registering the same auth method", async () => {
		const sharedMethod = "shared_attestation_jwt";
		const makeAuthExtensionPlugin = (id: string, assertionType: string) =>
			({
				id,
				init(ctx) {
					extendOAuthProvider(ctx, {
						clientAuthentication: {
							[sharedMethod]: {
								assertionTypes: [assertionType],
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
			}) satisfies BetterAuthPlugin;
		await expect(
			getTestInstance({
				baseURL: authServerBaseUrl,
				plugins: [
					jwt({ jwt: { issuer: authServerBaseUrl } }),
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						silenceWarnings: {
							oauthAuthServerConfig: true,
							openidConfig: true,
						},
					}),
					makeAuthExtensionPlugin("auth-ext-a", "urn:better-auth:test:a"),
					makeAuthExtensionPlugin("auth-ext-b", "urn:better-auth:test:b"),
				],
			}),
		).rejects.toThrow("register token_endpoint_auth_method");
	});

	it("rejects two extensions registering the same assertion type", async () => {
		const sharedAssertion = "urn:better-auth:test:shared-assertion";
		const makeAssertionExtensionPlugin = (id: string, method: string) =>
			({
				id,
				init(ctx) {
					extendOAuthProvider(ctx, {
						clientAuthentication: {
							[method]: {
								assertionTypes: [sharedAssertion],
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
			}) satisfies BetterAuthPlugin;
		await expect(
			getTestInstance({
				baseURL: authServerBaseUrl,
				plugins: [
					jwt({ jwt: { issuer: authServerBaseUrl } }),
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						silenceWarnings: {
							oauthAuthServerConfig: true,
							openidConfig: true,
						},
					}),
					makeAssertionExtensionPlugin("assert-ext-a", "method_a_jwt"),
					makeAssertionExtensionPlugin("assert-ext-b", "method_b_jwt"),
				],
			}),
		).rejects.toThrow("register client_assertion_type");
	});

	it("resolves a metadata key collision to the first-registered extension", async () => {
		const makeMetadataExtensionPlugin = (id: string, value: string) =>
			({
				id,
				init(ctx) {
					extendOAuthProvider(ctx, {
						metadata: () => ({ shared_metadata_field: value }),
					});
				},
			}) satisfies BetterAuthPlugin;
		const instance = await getTestInstance({
			baseURL: authServerBaseUrl,
			plugins: [
				jwt({ jwt: { issuer: authServerBaseUrl } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
				}),
				makeMetadataExtensionPlugin("meta-ext-a", "first"),
				makeMetadataExtensionPlugin("meta-ext-b", "second"),
			],
		});
		const metadata =
			(await instance.auth.api.getOpenIdConfig()) as unknown as Record<
				string,
				unknown
			>;
		expect(metadata.shared_metadata_field).toBe("first");
	});

	it("re-derives extension access-token claims on opaque-token introspection", async () => {
		const oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: extensionAuthMethod,
				grant_types: [extensionOpaqueGrant],
				scope: "openid email vc",
				type: "web",
			},
		});
		const tokenResponse = await client.$fetch<{ access_token: string }>(
			"/oauth2/token",
			{
				method: "POST",
				body: new URLSearchParams({
					grant_type: extensionOpaqueGrant,
					client_id: oauthClient!.client_id,
					client_assertion_type: extensionAssertionType,
					client_assertion: `assertion:${oauthClient!.client_id}`,
				}),
				headers: { "content-type": "application/x-www-form-urlencoded" },
			},
		);
		expect(tokenResponse.error).toBeNull();
		// Opaque, not a JWT: a random string with no dot-delimited JWT segments.
		expect(tokenResponse.data!.access_token).not.toContain(".");

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
				headers: { "content-type": "application/x-www-form-urlencoded" },
			},
		);
		expect(introspection.error).toBeNull();
		expect(introspection.data?.active).toBe(true);
		// Re-derived through the claim authority, not stored on the opaque row.
		expect(introspection.data?.extension_access_claim).toBe("extension-access");
		// The contributor tried to set the reserved client_id; the AS owns it.
		expect(introspection.data?.client_id).toBe(oauthClient!.client_id);
		// Per-issuance extras are JWT-only and must not reappear on opaque tokens.
		expect(introspection.data?.opaque_per_issuance).toBeUndefined();
	});

	it("surfaces an extension assertion rejection as invalid_client", async () => {
		const oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: extensionAuthMethod,
				grant_types: [extensionGrant],
				scope: "openid email vc",
				type: "web",
			},
		});
		const response = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: extensionGrant,
				client_id: oauthClient!.client_id,
				client_assertion_type: extensionAssertionType,
				client_assertion: "assertion:wrong",
				resource,
			}),
			headers: { "content-type": "application/x-www-form-urlencoded" },
		});
		expect(response.error?.status).toBe(401);
		expect((response.error as { error?: string } | undefined)?.error).toBe(
			"invalid_client",
		);
	});

	it("authenticates an extension assertion on the revoke endpoint", async () => {
		const oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: extensionAuthMethod,
				grant_types: [extensionOpaqueGrant],
				scope: "openid email vc",
				type: "web",
			},
		});
		const tokenResponse = await client.$fetch<{ access_token: string }>(
			"/oauth2/token",
			{
				method: "POST",
				body: new URLSearchParams({
					grant_type: extensionOpaqueGrant,
					client_id: oauthClient!.client_id,
					client_assertion_type: extensionAssertionType,
					client_assertion: `assertion:${oauthClient!.client_id}`,
				}),
				headers: { "content-type": "application/x-www-form-urlencoded" },
			},
		);
		expect(tokenResponse.error).toBeNull();
		const accessToken = tokenResponse.data!.access_token;

		const revoke = await client.$fetch("/oauth2/revoke", {
			method: "POST",
			body: new URLSearchParams({
				token: accessToken,
				client_id: oauthClient!.client_id,
				client_assertion_type: extensionAssertionType,
				client_assertion: `assertion:${oauthClient!.client_id}`,
			}),
			headers: { "content-type": "application/x-www-form-urlencoded" },
		});
		// No invalid_client: the extension assertion authenticated on /revoke.
		expect(revoke.error).toBeNull();

		const introspection = await client.$fetch<Record<string, unknown>>(
			"/oauth2/introspect",
			{
				method: "POST",
				body: new URLSearchParams({
					token: accessToken,
					client_id: oauthClient!.client_id,
					client_assertion_type: extensionAssertionType,
					client_assertion: `assertion:${oauthClient!.client_id}`,
				}),
				headers: { "content-type": "application/x-www-form-urlencoded" },
			},
		);
		// The revoked token is gone: introspection reports it inactive or unknown,
		// never active.
		expect(introspection.data?.active).not.toBe(true);
	});

	it("consumeClientAssertion rejects an already-expired assertion", async () => {
		const now = Math.floor(Date.now() / 1000);
		const audience = `${authServerBaseUrl}/oauth2/token`;
		// The expiry check fires before any adapter access, so a minimal ctx is
		// enough. An extension strategy that verifies the signature itself relies
		// on this; the built-in path has jose reject expiry first.
		await expect(
			consumeClientAssertion(
				{
					context: { baseURL: authServerBaseUrl },
				} as Parameters<typeof consumeClientAssertion>[0],
				{} as Parameters<typeof consumeClientAssertion>[1],
				{
					namespace: "test:expired",
					payload: { aud: audience, exp: now - 10, jti: "expired-jti" },
					expectedAudience: audience,
				},
			),
		).rejects.toMatchObject({
			statusCode: 400,
			body: {
				error: "invalid_client",
				error_description: "client assertion has expired",
			},
		});
	});
});
