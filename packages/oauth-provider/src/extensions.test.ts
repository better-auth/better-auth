import { APIError } from "better-auth/api";
import { createAuthClient } from "better-auth/client";
import { CLIENT_ASSERTION_TYPE } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { BetterAuthPlugin, User } from "better-auth/types";
import { decodeJwt } from "jose";
import { describe, expect, it, vi } from "vitest";
import { oauthProviderClient } from "./client";
import { extendOAuthProvider } from "./extensions";
import { oauthProvider } from "./oauth";
import { getOAuthProviderApi } from "./token";
import type {
	ClientDiscovery,
	Confirmation,
	OAuthProviderExtension,
	SchemaClient,
	Scope,
} from "./types";
import { consumeClientAssertion } from "./utils/client-assertion";

describe("oauth-provider extensions", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const resource = "https://vc.example.com/credential";
	const redirectUri = "https://client.example.com/callback";
	const extensionGrant = "urn:better-auth:test:grant";
	const extensionOpaqueGrant = "urn:better-auth:test:opaque-grant";
	const extensionOpaqueBoundGrant = "urn:better-auth:test:opaque-bound-grant";
	const extensionDriftGrant = "urn:better-auth:test:drift-grant";
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
					[extensionGrant]: async ({ ctx, provider }) => {
						observedCustomParam = (ctx.body as { custom_param?: string })
							.custom_param;
						if (!grantUser) {
							throw new APIError("BAD_REQUEST", {
								error: "invalid_request",
								error_description: "test user is not ready",
							});
						}
						const { client, confirmation } = await provider.authenticateClient({
							scopes: ["openid", "email", "vc"],
						});
						return provider.issueTokens({
							client,
							scopes: ["openid", "email", "vc"],
							user: grantUser,
							resources: [resource],
							// Forward the confirmation the auth strategy proved.
							confirmation,
							accessTokenClaims: {
								grant_claim: "grant-access",
								client_id: "malicious-client",
							},
							idTokenClaims: {
								grant_id_claim: "grant-id",
								sub: "malicious-sub",
								auth_time: 0,
								amr: ["malicious-grant"],
								azp: "malicious-authorized-party",
								nbf: 0,
								jti: "malicious-jti",
								c_hash: "malicious-code-hash",
								s_hash: "malicious-state-hash",
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
					[extensionOpaqueGrant]: async ({ provider }) => {
						if (!grantUser) {
							throw new APIError("BAD_REQUEST", {
								error: "invalid_request",
								error_description: "test user is not ready",
							});
						}
						const { client } = await provider.authenticateClient({
							scopes: ["openid", "email", "vc"],
						});
						return provider.issueTokens({
							client,
							scopes: ["openid", "email", "vc"],
							user: grantUser,
							accessTokenClaims: {
								opaque_per_issuance: "persisted",
								nested_claim: { tier: "gold", regions: ["eu", "us"] },
								issued_for: new Date("2026-01-01T00:00:00.000Z"),
								dropped_claim: undefined,
								access_order_probe: "grant",
								client_id: "malicious-grant-client",
								sub: "malicious-grant-sub",
								act: { sub: "forged-actor" },
								cnf: { jkt: "forged-by-grant" },
							},
						});
					},
					// Sender-constrains an opaque access token (no resource). The
					// confirmation is persisted on the opaque-token row (RFC 7800 `cnf`)
					// and surfaced at introspection, not silently dropped.
					[extensionOpaqueBoundGrant]: async ({ provider }) => {
						if (!grantUser) {
							throw new APIError("BAD_REQUEST", {
								error: "invalid_request",
								error_description: "test user is not ready",
							});
						}
						const { client } = await provider.authenticateClient({
							scopes: ["openid", "email", "vc"],
						});
						return provider.issueTokens({
							client,
							scopes: ["openid", "email", "vc"],
							user: grantUser,
							confirmation: { jkt: "opaque-bound-jkt" },
						});
					},
					// A stale/buggy handler that still passes a permissive grantType the
					// type no longer allows. The provider must ignore it and authorize
					// against the dispatched grant.
					[extensionDriftGrant]: async ({ provider }) => {
						if (!grantUser) {
							throw new APIError("BAD_REQUEST", {
								error: "invalid_request",
								error_description: "test user is not ready",
							});
						}
						const staleRequest = {
							scopes: ["openid", "email", "vc"],
							grantType: extensionOpaqueGrant,
						} as Parameters<typeof provider.authenticateClient>[0];
						const { client } = await provider.authenticateClient(staleRequest);
						return provider.issueTokens({
							client,
							scopes: ["openid", "email", "vc"],
							user: grantUser,
						});
					},
				},
				clientAuthentication: {
					[extensionAuthMethod]: {
						assertionTypes: [extensionAssertionType],
						authenticate: async ({ assertion, clientId }) => {
							if (!clientId || assertion !== `assertion:${clientId}`) {
								throw new APIError("UNAUTHORIZED", {
									error: "invalid_client",
									error_description: "invalid test assertion",
								});
							}
							// Prove the caller controls clientId; the provider resolves and
							// authorizes the client record itself.
							return {
								clientId,
								// A sender-constraint the strategy proved (wallet
								// attestation); the grant forwards it to issueTokens. An
								// mTLS-style `x5t#S256` keeps the token bearer-presentable,
								// unlike a DPoP `jkt` which would require a proof per request.
								confirmation: { "x5t#S256": "wallet-attested-cert" },
							};
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
						access_order_probe: "extension",
						client_id: "malicious-extension-client",
						cnf: { jkt: "forged-by-extension" },
					}),
					idToken: () => ({
						extension_id_claim: "extension-id",
						sub: "malicious-extension-sub",
						email: "evil@malicious.example",
						azp: "malicious-extension-authorized-party",
						jti: "malicious-extension-jti",
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
					sub: "malicious-custom-sub", // re-pinned by the endpoint
					email_verified: true, // first-party override of a base claim
				}),
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
				application_type: "web",
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
				application_type: "web",
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
					application_type: "web",
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
					application_type: "web",
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
					jwks: {
						keys: [{ kty: "RSA", n: "test", e: "test-exponent" }],
					},
					jwks_uri: "https://client.example.com/jwks",
					scope: "openid email vc",
					application_type: "web",
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

	it("rejects assertion auth for clients with omitted (default) auth method", async () => {
		// A client with no explicit auth method defaults to client_secret_basic, so
		// it cannot authenticate through an extension assertion method.
		const legacyClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				grant_types: [extensionGrant],
				scope: "openid email vc",
				application_type: "web",
			},
		});
		const response = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: extensionGrant,
				client_id: legacyClient!.client_id,
				client_assertion_type: extensionAssertionType,
				client_assertion: `assertion:${legacyClient!.client_id}`,
			}),
			headers: {
				"content-type": "application/x-www-form-urlencoded",
			},
		});
		expect(response.error?.status).toBe(400);
		expect(
			(response.error as { error_description?: string } | undefined)
				?.error_description,
		).toContain("client registered for client_secret_basic cannot use");
	});

	it("returns invalid_client when an extension grant omits required credentials", async () => {
		const confidentialClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				grant_types: [extensionGrant],
				scope: "openid email vc",
				application_type: "web",
			},
		});
		const response = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: extensionGrant,
				client_id: confidentialClient!.client_id,
			}),
			headers: {
				"content-type": "application/x-www-form-urlencoded",
			},
		});

		expect(response.error?.status).toBe(400);
		expect((response.error as { error?: string } | undefined)?.error).toBe(
			"invalid_client",
		);
	});

	it("challenges Basic authentication with an empty secret", async () => {
		const confidentialClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				grant_types: [extensionGrant],
				scope: "openid email vc",
				application_type: "web",
			},
		});
		if (!confidentialClient?.client_id) {
			throw new Error("confidential OAuth client was not created");
		}

		let responseHeaders: Headers | undefined;
		const response = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({ grant_type: extensionGrant }),
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				authorization: `Basic ${Buffer.from(`${confidentialClient.client_id}:`).toString("base64")}`,
			},
			onError(context) {
				responseHeaders = context.response.headers;
			},
		});

		expect(response.error?.status).toBe(401);
		expect((response.error as { error?: string } | undefined)?.error).toBe(
			"invalid_client",
		);
		expect(responseHeaders?.get("WWW-Authenticate")).toBe("Basic");
	});

	it("authorizes against the resolved record, not the strategy", async () => {
		// The strategy proves a client id; the provider resolves the record. A proven
		// id with no registered client is rejected, since a strategy cannot conjure a
		// client the authorization server never registered.
		const response = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: extensionGrant,
				client_id: "unregistered-but-proven",
				client_assertion_type: extensionAssertionType,
				client_assertion: "assertion:unregistered-but-proven",
			}),
			headers: {
				"content-type": "application/x-www-form-urlencoded",
			},
		});
		expect(response.error?.status).toBe(400);
		expect((response.error as { error?: string } | undefined)?.error).toBe(
			"invalid_client",
		);
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
		// Re-running init() with the same extension object must not double-register.
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
				application_type: "web",
			},
		});
		expect(oauthClient?.client_id).toBeDefined();

		const tokenResponse = await client.$fetch<{
			access_token: string;
			id_token: string;
			issued_token_type: string;
			scope: string;
			token_type: string;
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
		// The auth strategy proved a confirmation, the grant forwarded it through
		// authenticateClient, and it is stamped as `cnf`, sender-constraining the
		// token. `cnf` is AS-owned, so the extension's forged `cnf` is stripped and
		// the strategy's confirmation is the only one present.
		expect(accessTokenPayload.cnf).toEqual({
			"x5t#S256": "wallet-attested-cert",
		});
		expect(tokenResponse.data?.token_type).toBe("Bearer");

		const idTokenPayload = decodeJwt(tokenResponse.data!.id_token);
		expect(idTokenPayload.extension_id_claim).toBe("extension-id");
		expect(idTokenPayload.grant_id_claim).toBe("grant-id");
		expect(idTokenPayload.sub).toBe(user.id);
		expect(idTokenPayload.auth_time).toBeUndefined();
		expect(idTokenPayload.amr).toBeUndefined();
		expect(idTokenPayload.azp).toBeUndefined();
		expect(idTokenPayload.nbf).toBeUndefined();
		expect(idTokenPayload.jti).toBeUndefined();
		expect(idTokenPayload.c_hash).toBeUndefined();
		expect(idTokenPayload.s_hash).toBeUndefined();
		// Extension id-token claims are additive: they cannot fill standard
		// identity claims that scope values only request from UserInfo.
		expect(idTokenPayload.email).toBeUndefined();
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

	it("ignores a runtime grantType argument and gates on the dispatched grant", async () => {
		// The drift handler smuggles grantType: extensionOpaqueGrant into
		// authenticateClient. This client is registered for the opaque grant but not
		// the dispatched drift grant. Honoring the smuggled grant would authorize it;
		// the bound grant must gate instead.
		const oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: extensionAuthMethod,
				grant_types: [extensionOpaqueGrant],
				scope: "openid email vc",
				application_type: "web",
			},
		});
		const response = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: extensionDriftGrant,
				client_id: oauthClient!.client_id,
				client_assertion_type: extensionAssertionType,
				client_assertion: `assertion:${oauthClient!.client_id}`,
			}),
			headers: {
				"content-type": "application/x-www-form-urlencoded",
			},
		});
		expect(response.error?.status).toBe(400);
		expect((response.error as { error?: string } | undefined)?.error).toBe(
			"unauthorized_client",
		);
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
					}),
					makeAssertionExtensionPlugin("assert-ext-a", "method_a_jwt"),
					makeAssertionExtensionPlugin("assert-ext-b", "method_b_jwt"),
				],
			}),
		).rejects.toThrow("register client_assertion_type");
	});

	it("rejects duplicate client discovery identifiers", async () => {
		const makeDiscoveryExtensionPlugin = (pluginId: string) =>
			({
				id: pluginId,
				init(ctx) {
					extendOAuthProvider(ctx, {
						clientDiscovery: {
							id: "shared-client-discovery",
							matches: () => false,
							resolve: () => null,
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
					}),
					makeDiscoveryExtensionPlugin("discovery-ext-a"),
					makeDiscoveryExtensionPlugin("discovery-ext-b"),
				],
			}),
		).rejects.toThrow("register client discovery id");
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

	/**
	 * @see https://www.better-auth.com/docs/plugins/oauth-provider/reference#provider-extensions
	 */
	it("combines lists two extensions contribute and warns on other collisions", async () => {
		const makeMetadataExtensionPlugin = (
			id: string,
			metadata: Record<string, unknown>,
		) =>
			({
				id,
				init(ctx) {
					extendOAuthProvider(ctx, { metadata: () => metadata });
				},
			}) satisfies BetterAuthPlugin;
		const instance = await getTestInstance({
			baseURL: authServerBaseUrl,
			plugins: [
				jwt({ jwt: { issuer: authServerBaseUrl } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
				}),
				makeMetadataExtensionPlugin("meta-ext-a", {
					authorization_details_types_supported: ["type_a", "type_b"],
					mixed_shape_field: ["first"],
					only_in_a: true,
				}),
				makeMetadataExtensionPlugin("meta-ext-b", {
					authorization_details_types_supported: ["type_b", "type_c"],
					mixed_shape_field: "second",
					issuer: "https://ignored.example.com",
				}),
			],
		});
		const { logger } = await instance.auth.$context;
		const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

		const openIdConfig =
			(await instance.auth.api.getOpenIdConfig()) as unknown as Record<
				string,
				unknown
			>;
		expect(openIdConfig.authorization_details_types_supported).toEqual([
			"type_a",
			"type_b",
			"type_c",
		]);
		expect(openIdConfig.mixed_shape_field).toEqual(["first"]);
		expect(warn.mock.calls.map(([message]) => message)).toEqual([
			'oauth-provider: two extensions contributed the discovery metadata key "mixed_shape_field" to openid-configuration; keeping the first-registered value.',
		]);
	});

	it("re-derives extension access-token claims on opaque-token introspection", async () => {
		const oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: extensionAuthMethod,
				grant_types: [extensionOpaqueGrant],
				scope: "openid email vc",
				application_type: "web",
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
	});

	it("persists per-issuance access-token claims on opaque tokens and returns them at introspection", async () => {
		const oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: extensionAuthMethod,
				grant_types: [extensionOpaqueGrant],
				scope: "openid email vc",
				application_type: "web",
			},
		});
		const clientAuth = {
			client_id: oauthClient!.client_id,
			client_assertion_type: extensionAssertionType,
			client_assertion: `assertion:${oauthClient!.client_id}`,
		};
		const tokenResponse = await client.$fetch<{ access_token: string }>(
			"/oauth2/token",
			{
				method: "POST",
				body: new URLSearchParams({
					grant_type: extensionOpaqueGrant,
					...clientAuth,
				}),
				headers: { "content-type": "application/x-www-form-urlencoded" },
			},
		);
		expect(tokenResponse.error).toBeNull();
		const accessToken = tokenResponse.data!.access_token;
		expect(accessToken).not.toContain(".");

		const introspection = await client.$fetch<Record<string, unknown>>(
			"/oauth2/introspect",
			{
				method: "POST",
				body: new URLSearchParams({ token: accessToken, ...clientAuth }),
				headers: { "content-type": "application/x-www-form-urlencoded" },
			},
		);
		expect(introspection.error).toBeNull();
		expect(introspection.data?.active).toBe(true);
		expect(introspection.data?.opaque_per_issuance).toBe("persisted");
		expect(introspection.data?.nested_claim).toEqual({
			tier: "gold",
			regions: ["eu", "us"],
		});
		// Same precedence as the JWT mint: per-issuance claims override
		// extension contributors.
		expect(introspection.data?.access_order_probe).toBe("grant");
		// Reserved names stay owned by the authorization server.
		expect(introspection.data?.client_id).toBe(oauthClient!.client_id);
		expect(introspection.data?.sub).toBe(grantUser!.id);
		expect(introspection.data?.act).toBeUndefined();
		expect(introspection.data?.cnf).toBeUndefined();

		// Reserved names are removed before storage, not only at introspection.
		const ctx = await auth.$context;
		const rows = await ctx.adapter.findMany<{
			accessTokenClaims?: Record<string, unknown> | null;
		}>({
			model: "oauthAccessToken",
			where: [{ field: "clientId", value: oauthClient!.client_id }],
		});
		expect(rows).toHaveLength(1);
		// Stored in JSON form, as a signed JWT would carry it: an `undefined`
		// value is dropped.
		expect(Object.keys(rows[0]!.accessTokenClaims ?? {}).sort()).toEqual([
			"access_order_probe",
			"issued_for",
			"nested_claim",
			"opaque_per_issuance",
		]);
	});

	it("surfaces an extension assertion rejection as invalid_client", async () => {
		const oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: extensionAuthMethod,
				grant_types: [extensionGrant],
				scope: "openid email vc",
				application_type: "web",
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
				application_type: "web",
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
		const issuer = authServerBaseUrl;
		// The expiry check runs before any adapter access, so a minimal ctx is enough.
		await expect(
			consumeClientAssertion(
				{
					context: { baseURL: authServerBaseUrl },
				} as Parameters<typeof consumeClientAssertion>[0],
				{ disableJwtPlugin: true } as Parameters<
					typeof consumeClientAssertion
				>[1],
				{
					namespace: "test:expired",
					payload: { aud: issuer, exp: now - 10, jti: "expired-jti" },
					acceptedAudiences: [issuer],
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

	it("binds an opaque access token to its confirmation and surfaces it at introspection", async () => {
		const oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: extensionAuthMethod,
				grant_types: [extensionOpaqueBoundGrant],
				scope: "openid email vc",
				application_type: "web",
			},
		});
		const clientAuth = {
			client_id: oauthClient!.client_id,
			client_assertion_type: extensionAssertionType,
			client_assertion: `assertion:${oauthClient!.client_id}`,
		};
		const response = await client.$fetch<{
			access_token: string;
			token_type: string;
		}>("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: extensionOpaqueBoundGrant,
				...clientAuth,
			}),
			headers: { "content-type": "application/x-www-form-urlencoded" },
		});
		// The opaque token carries the RFC 7800 `cnf` confirmation (persisted on
		// its row), so it is sender-constrained, not silently minted unbound.
		expect(response.error).toBeNull();
		expect(response.data?.token_type).toBe("DPoP");

		const introspection = await client.$fetch<{
			active: boolean;
			token_type?: string;
			cnf?: unknown;
		}>("/oauth2/introspect", {
			method: "POST",
			body: new URLSearchParams({
				token: response.data!.access_token,
				token_type_hint: "access_token",
				...clientAuth,
			}),
			headers: { "content-type": "application/x-www-form-urlencoded" },
		});
		expect(introspection.data?.active).toBe(true);
		expect(introspection.data?.token_type).toBe("DPoP");
		expect(introspection.data?.cnf).toEqual({ jkt: "opaque-bound-jkt" });

		// An issuance without per-issuance claims stores none.
		const row = await (await auth.$context).adapter.findOne<{
			accessTokenClaims?: Record<string, unknown> | null;
		}>({
			model: "oauthAccessToken",
			where: [{ field: "clientId", value: oauthClient!.client_id }],
		});
		expect(row?.accessTokenClaims ?? null).toBeNull();
	});

	it("authenticateClient binds the assertion audience to the served endpoint", async () => {
		let observedAudience: string | undefined;
		const opts = {
			extensions: [
				{
					clientAuthentication: {
						audience_probe_method: {
							assertionTypes: ["urn:better-auth:test:audience-probe"],
							authenticate: async ({
								expectedAudience,
							}: {
								expectedAudience?: string;
							}) => {
								observedAudience = expectedAudience;
								// Stop before client validation; we only assert the audience.
								throw new APIError("BAD_REQUEST", {
									error: "invalid_client",
									error_description: "audience recorded",
								});
							},
						},
					},
				},
			],
		} as unknown as Parameters<typeof getOAuthProviderApi>[1];
		const ctx = {
			path: "/oauth2/bc-authorize",
			context: { baseURL: authServerBaseUrl },
			body: {
				client_id: "probe-client",
				client_assertion: "probe-assertion",
				client_assertion_type: "urn:better-auth:test:audience-probe",
			},
			request: { headers: new Headers() },
		} as unknown as Parameters<typeof getOAuthProviderApi>[0];
		await expect(
			getOAuthProviderApi(
				ctx,
				opts,
				"urn:better-auth:test:grant",
			).authenticateClient(),
		).rejects.toBeDefined();
		// The audience is the endpoint serving the request, not a hardcoded token
		// endpoint, so the same assertion cannot be replayed at another endpoint.
		expect(observedAudience).toBe(`${authServerBaseUrl}/oauth2/bc-authorize`);
	});

	it("getOAuthProviderApi.issueTokens requires a bound grant type", () => {
		const api = getOAuthProviderApi(
			{
				context: { baseURL: authServerBaseUrl },
			} as Parameters<typeof getOAuthProviderApi>[0],
			{} as Parameters<typeof getOAuthProviderApi>[1],
		);
		// No grantType bound (the accessor was obtained for non-issuing
		// capabilities): issuing must fail loudly rather than mislabel the grant.
		expect(() =>
			api.issueTokens({
				client: { clientId: "x" } as SchemaClient<Scope[]>,
				scopes: [],
			}),
		).toThrow(
			expect.objectContaining({
				body: expect.objectContaining({
					error_description: expect.stringContaining("grant type"),
				}),
			}),
		);
	});
});

describe("oauth-provider client metadata extensions", async () => {
	const baseURL = "http://localhost:3000";
	const redirectUri = "https://client.example.com/callback";
	const invalid = { body: { error: "invalid_client_metadata" } };

	const { auth, signInWithTestUser } = await getTestInstance({
		baseURL,
		plugins: [
			jwt({ jwt: { issuer: baseURL } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				allowDynamicClientRegistration: true,
			}),
			{
				id: "client-metadata-extension",
				init(ctx) {
					extendOAuthProvider(ctx, {
						clientMetadata: {
							fields: ["example_mode"],
							validate: ({ client, metadata }) => {
								// Extension fields must reach validators only through `metadata`.
								if (
									"metadata" in client ||
									"example_mode" in client ||
									"admin_note" in client
								) {
									throw new Error("extension fields leaked into client");
								}
								if (
									metadata.example_mode !== undefined &&
									metadata.example_mode !== "ok"
								) {
									throw new APIError("BAD_REQUEST", {
										error: "invalid_client_metadata",
										error_description: "example_mode must be ok",
									});
								}
							},
						},
					});
				},
			} satisfies BetterAuthPlugin,
		],
	});
	const { headers } = await signInWithTestUser();

	it("stores only declared fields from dynamic registration", async () => {
		const body = {
			redirect_uris: [redirectUri],
			example_mode: "ok",
			disabled: true,
			metadata: { injected: true },
			unknown_field: "ignored",
		};
		const client = await auth.api.registerOAuthClient({ headers, body });
		expect(Reflect.get(client, "example_mode")).toBe("ok");
		expect(client.disabled).not.toBe(true);
		expect(Reflect.get(client, "injected")).toBeUndefined();
		expect(Reflect.get(client, "unknown_field")).toBeUndefined();
	});

	it("rejects invalid declared fields at dynamic registration", async () => {
		const body = { redirect_uris: [redirectUri], example_mode: "bad" };
		await expect(
			auth.api.registerOAuthClient({ headers, body }),
		).rejects.toMatchObject(invalid);
	});

	it("rejects invalid metadata at admin create and update", async () => {
		await expect(
			auth.api.adminCreateOAuthClient({
				headers,
				body: {
					redirect_uris: [redirectUri],
					metadata: { example_mode: "bad" },
				},
			}),
		).rejects.toMatchObject(invalid);

		const client = await auth.api.adminCreateOAuthClient({
			headers,
			body: { redirect_uris: [redirectUri], metadata: { example_mode: "ok" } },
		});
		await expect(
			auth.api.adminUpdateOAuthClient({
				headers,
				body: {
					client_id: client.client_id,
					update: { metadata: { example_mode: "bad" } },
				},
			}),
		).rejects.toMatchObject(invalid);
	});

	it("keeps undeclared stored metadata off the client on admin update", async () => {
		const client = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				metadata: { example_mode: "ok", admin_note: "kept" },
			},
		});
		const updated = await auth.api.adminUpdateOAuthClient({
			headers,
			body: {
				client_id: client.client_id,
				update: { client_name: "Renamed" },
			},
		});
		expect(updated.client_name).toBe("Renamed");
	});

	it("clears stored metadata when an admin update replaces it with an empty object", async () => {
		const client = await auth.api.adminCreateOAuthClient({
			headers,
			body: { redirect_uris: [redirectUri], metadata: { example_mode: "ok" } },
		});
		await auth.api.adminUpdateOAuthClient({
			headers,
			body: { client_id: client.client_id, update: { metadata: {} } },
		});
		const stored = await auth.api.getOAuthClient({
			headers,
			query: { client_id: client.client_id },
		});
		expect(Reflect.get(stored, "example_mode")).toBeUndefined();
	});

	it("rejects an extension that claims a core client field", async () => {
		await expect(
			getTestInstance({
				baseURL,
				plugins: [
					jwt({ jwt: { issuer: baseURL } }),
					oauthProvider({ loginPage: "/login", consentPage: "/consent" }),
					{
						id: "reserved-client-metadata-extension",
						init(ctx) {
							extendOAuthProvider(ctx, {
								clientMetadata: { fields: ["redirect_uris"] },
							});
						},
					} satisfies BetterAuthPlugin,
				],
			}),
		).rejects.toThrow("client metadata field is reserved: redirect_uris");
	});
});

/**
 * @see https://datatracker.ietf.org/doc/html/rfc8705#section-3
 */
describe("client_credentials with a confirmation-proving strategy", async () => {
	const issuer = "http://localhost:3000";
	const resource = "https://api.example.com";
	const dpopResource = "https://dpop-api.example.com";
	const authMethod = "test_attestation_jwt";
	const assertionType =
		"urn:better-auth:test:client-assertion-type:test-attestation";
	let proven: Confirmation = { "x5t#S256": "attested-certificate" };
	// A grant that consumes a one-time credential after resolving its binding,
	// like the device code and CIBA grants.
	const oneTimeGrant = "urn:better-auth:test:one-time-grant";
	let consumed = 0;
	const strategy = {
		id: "test-confirmation-strategy",
		init(ctx) {
			extendOAuthProvider(ctx, {
				grants: {
					[oneTimeGrant]: async ({ provider }) => {
						const { client, confirmation } =
							await provider.authenticateClient();
						const binding = await provider.resolveConfirmation({
							client,
							scopes: ["read"],
							confirmation,
						});
						consumed++;
						return provider.issueTokens({
							client,
							scopes: ["read"],
							confirmation: binding,
						});
					},
				},
				clientAuthentication: {
					[authMethod]: {
						assertionTypes: [assertionType],
						authenticate: async ({ clientId }) => ({
							clientId: clientId!,
							confirmation: proven,
						}),
					},
				},
			});
		},
	} satisfies BetterAuthPlugin;
	const { auth, client, signInWithTestUser } = await getTestInstance({
		baseURL: issuer,
		plugins: [
			jwt({ jwt: { issuer } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				scopes: ["read"],
				resources: [
					resource,
					{ identifier: dpopResource, dpopBoundAccessTokensRequired: true },
				],
				enforcePerClientResources: false,
				clientPrivileges: () => true,
			}),
			strategy,
		],
	});
	const { headers } = await signInWithTestUser();

	const issue = async ({
		target = resource,
		dpopBound = false,
	}: {
		target?: string;
		dpopBound?: boolean;
	} = {}) => {
		const machine = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: authMethod,
				grant_types: ["client_credentials"],
				scope: "read",
				client_credentials_scopes: ["read"],
				...(dpopBound ? { dpop_bound_access_tokens: true } : {}),
			},
		});
		return client.$fetch<{ access_token: string; token_type: string }>(
			"/oauth2/token",
			{
				method: "POST",
				body: new URLSearchParams({
					grant_type: "client_credentials",
					client_id: machine.client_id,
					client_assertion_type: assertionType,
					client_assertion: `assertion:${machine.client_id}`,
					scope: "read",
					resource: target,
				}),
				headers: { "content-type": "application/x-www-form-urlencoded" },
			},
		);
	};

	it("binds the token to the confirmation the strategy proved", async () => {
		proven = { "x5t#S256": "attested-certificate" };
		const { data, error } = await issue();
		expect(error).toBeNull();
		expect(decodeJwt(data!.access_token).cnf).toEqual(proven);
		expect(data?.token_type).toBe("Bearer");
	});

	it("issues a DPoP token for a DPoP key confirmation", async () => {
		proven = { jkt: "strategy-proven-key" };
		const { data, error } = await issue({ target: dpopResource });
		expect(error).toBeNull();
		expect(data?.token_type).toBe("DPoP");
		expect(decodeJwt(data!.access_token).cnf).toEqual(proven);
	});

	it("rejects a certificate confirmation before a one-time credential is consumed", async () => {
		proven = { "x5t#S256": "attested-certificate" };
		const machine = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: authMethod,
				grant_types: [oneTimeGrant],
				scope: "read",
				dpop_bound_access_tokens: true,
			},
		});
		consumed = 0;
		const { error } = await client.$fetch("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: oneTimeGrant,
				client_id: machine.client_id,
				client_assertion_type: assertionType,
				client_assertion: `assertion:${machine.client_id}`,
			}),
			headers: { "content-type": "application/x-www-form-urlencoded" },
		});
		expect(error).toMatchObject({
			error: "invalid_dpop_proof",
			error_description: "A DPoP-bound access token is required",
		});
		expect(consumed).toBe(0);
	});

	it.each([
		["the client requires DPoP-bound tokens", { dpopBound: true }],
		["the resource requires DPoP-bound tokens", { target: dpopResource }],
	])("rejects a certificate confirmation when %s", async (_, options) => {
		proven = { "x5t#S256": "attested-certificate" };
		const { error } = await issue(options);
		expect(error).toMatchObject({
			error: "invalid_dpop_proof",
			error_description: "A DPoP-bound access token is required",
		});
	});
});

/**
 * @see https://datatracker.ietf.org/doc/html/rfc7800#section-3.1
 * @see https://datatracker.ietf.org/doc/html/rfc9449#section-6
 * @see https://datatracker.ietf.org/doc/html/rfc8705#section-3.1
 */
describe("oauth-provider extension client authentication confirmation", async () => {
	const baseURL = "http://localhost:3000";
	const authMethod = "malformed_confirmation_jwt";
	const assertionType =
		"urn:better-auth:test:client-assertion-type:malformed-confirmation";
	let strategyConfirmation: unknown;

	const { auth, signInWithTestUser } = await getTestInstance({
		baseURL,
		plugins: [
			jwt({ jwt: { issuer: baseURL } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				scopes: ["read"],
				clientPrivileges: () => true,
			}),
			{
				id: "malformed-confirmation-extension",
				init(ctx) {
					extendOAuthProvider(ctx, {
						clientAuthentication: {
							[authMethod]: {
								assertionTypes: [assertionType],
								authenticate: async ({ clientId }) => ({
									clientId: clientId!,
									confirmation: strategyConfirmation as Confirmation,
								}),
							},
						},
					});
				},
			} satisfies BetterAuthPlugin,
		],
	});
	const { headers } = await signInWithTestUser();
	const oauthClient = await auth.api.adminCreateOAuthClient({
		headers,
		body: {
			token_endpoint_auth_method: authMethod,
			grant_types: ["client_credentials"],
			scope: "read",
			client_credentials_scopes: ["read"],
		},
	});

	const requestToken = () =>
		auth.handler(
			new Request(`${baseURL}/api/auth/oauth2/token`, {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "client_credentials",
					scope: "read",
					client_id: oauthClient!.client_id,
					client_assertion_type: assertionType,
					client_assertion: "assertion",
				}),
			}),
		);

	it("issues a token bound to a well-formed strategy confirmation", async () => {
		strategyConfirmation = { "x5t#S256": "strategy-cert" };
		const response = await requestToken();
		expect(response.status).toBe(200);
	});

	it.each([
		["both members", { jkt: "strategy-jkt", "x5t#S256": "strategy-cert" }],
		["neither member", {}],
		["a non-string member", { jkt: 1 }],
		["an empty jkt", { jkt: "" }],
		["an empty x5t#S256", { "x5t#S256": "" }],
		["an extra member", { jkt: "strategy-jkt", extra: "value" }],
		["an array", Object.assign([], { jkt: "strategy-jkt" })],
		["an inherited member", Object.create({ jkt: "strategy-jkt" })],
	])("rejects a strategy confirmation with %s", async (_, confirmation) => {
		strategyConfirmation = confirmation;
		const response = await requestToken();
		expect(response.status).toBe(500);
		expect(await response.json()).toMatchObject({ error: "server_error" });
	});

	describe("from an extension grant", () => {
		const api = getOAuthProviderApi(
			{
				context: { baseURL },
			} as Parameters<typeof getOAuthProviderApi>[0],
			{} as Parameters<typeof getOAuthProviderApi>[1],
			"urn:better-auth:test:grant",
		);
		const client = { clientId: "x" } as SchemaClient<Scope[]>;
		const confirmation = {
			jkt: "strategy-jkt",
			"x5t#S256": "strategy-cert",
		} as unknown as Confirmation;
		const serverError = expect.objectContaining({
			body: expect.objectContaining({ error: "server_error" }),
		});

		it("rejects a malformed confirmation passed to issueTokens", () => {
			expect(() =>
				api.issueTokens({ client, scopes: [], confirmation }),
			).toThrow(serverError);
		});

		it("rejects a malformed confirmation passed to resolveConfirmation", async () => {
			await expect(
				api.resolveConfirmation({ client, scopes: [], confirmation }),
			).rejects.toThrow(serverError);
		});
	});
});

it("keeps act on a JWT access token issued without a user", async () => {
	const grantType = "urn:better-auth:test:client-actor-grant";
	const resource = "https://api.example.com";
	const issuer = "http://localhost:3000";
	const plugin = {
		id: "test-client-actor-grant",
		init(ctx) {
			extendOAuthProvider(ctx, {
				grants: {
					[grantType]: async ({ provider }) => {
						const { client } = await provider.authenticateClient({
							scopes: ["read"],
						});
						return provider.issueTokens({
							client,
							scopes: ["read"],
							resources: [resource],
							act: { sub: "upstream-service" },
						});
					},
				},
			});
		},
	} satisfies BetterAuthPlugin;
	const { auth, signInWithTestUser } = await getTestInstance({
		baseURL: issuer,
		plugins: [
			jwt({ jwt: { issuer } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				scopes: ["read"],
				resources: [resource],
				enforcePerClientResources: false,
			}),
			plugin,
		],
	});
	const { headers } = await signInWithTestUser();
	const oauthClient = await auth.api.adminCreateOAuthClient({
		headers,
		body: {
			token_endpoint_auth_method: "client_secret_post",
			grant_types: [grantType],
			scope: "read",
		},
	});
	const tokens = await auth.api.oauth2Token({
		body: {
			grant_type: grantType,
			client_id: oauthClient!.client_id,
			client_secret: oauthClient!.client_secret!,
		},
	});
	expect(decodeJwt(tokens.access_token)).toMatchObject({
		sub: oauthClient!.client_id,
		act: { sub: "upstream-service" },
	});
});

describe.each(["postgres", "mysql"] as const)(
	"opaque access-token claims on %s",
	(testWith) => {
		const grantType = "urn:better-auth:test:stored-claims-grant";

		it("stores per-issuance claims and returns them at introspection", async () => {
			const plugin = {
				id: "test-stored-claims-grant",
				init(ctx) {
					extendOAuthProvider(ctx, {
						grants: {
							[grantType]: async ({ provider }) => {
								const { client } = await provider.authenticateClient({
									scopes: ["read"],
								});
								return provider.issueTokens({
									client,
									scopes: ["read"],
									accessTokenClaims: {
										tenant: { id: "t_1", regions: ["eu"] },
										client_id: "malicious-client",
									},
								});
							},
						},
					});
				},
			} satisfies BetterAuthPlugin;
			const { auth, signInWithTestUser } = await getTestInstance(
				{
					plugins: [
						oauthProvider({
							loginPage: "/login",
							consentPage: "/consent",
							scopes: ["read"],
							disableJwtPlugin: true,
						}),
						plugin,
					],
				},
				{
					testWith,
					testUser: { email: `${crypto.randomUUID()}@test.com` },
				},
			);
			const { headers } = await signInWithTestUser();
			const oauthClient = await auth.api.adminCreateOAuthClient({
				headers,
				body: {
					token_endpoint_auth_method: "client_secret_post",
					grant_types: [grantType],
					scope: "read",
				},
			});
			const clientAuth = {
				client_id: oauthClient!.client_id,
				client_secret: oauthClient!.client_secret!,
			};
			const tokens = await auth.api.oauth2Token({
				body: { grant_type: grantType, ...clientAuth },
			});
			const introspection = await auth.api.oauth2Introspect({
				body: { token: tokens.access_token, ...clientAuth },
			});
			expect(introspection.active).toBe(true);
			expect(introspection.tenant).toEqual({ id: "t_1", regions: ["eu"] });
			expect(introspection.client_id).toBe(oauthClient!.client_id);
		});
	},
);
