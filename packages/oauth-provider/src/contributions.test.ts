import { createAuthClient } from "better-auth/client";
import { jwtClient } from "better-auth/client/plugins";
import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { BetterAuthPlugin } from "better-auth/types";
import { APIError } from "better-call";
import { decodeJwt } from "jose";
import { describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import {
	createUserTokens,
	getClient,
	validateClientCredentials,
} from "./index";
import { oauthProvider } from "./oauth";
import type { OAuthContributions } from "./types/contributions";

const BASE_URL = "http://localhost:3000";
const TOKEN_URL = `${BASE_URL}/api/auth/oauth2/token`;
const INTROSPECT_URL = `${BASE_URL}/api/auth/oauth2/introspect`;
const METADATA_URL = `${BASE_URL}/api/auth/.well-known/oauth-authorization-server`;
const CUSTOM_GRANT = "urn:better-auth:test:custom-grant";
// A custom grant whose handler reuses the exported createUserTokens to mint, and
// injects per-request claims/response fields via CreateUserTokensParams.extra.
const CLAIMS_GRANT = "urn:better-auth:test:claims-grant";
// A custom token-endpoint client-auth method backed by a contributed verifier.
const ASSERTION_TYPE = "urn:better-auth:test:assertion";
const RESOURCE = "https://api.test";

/**
 * A guest plugin that exercises every OAuthContributions slot: a custom grant
 * handler, the grant URI, discovery metadata, an advertised auth method, and
 * access- and id-token claim contributors.
 */
function contributionProbe() {
	return {
		id: "contribution-probe",
		requires: ["oauth-provider"],
		contributes: {
			"oauth-provider": {
				grantTypes: {
					// The handler echoes a passthrough body param to prove the open
					// schema preserves extension params. It sets the RFC 6749 §5.1
					// cache headers a token-endpoint response must carry, so the
					// canonical GrantHandler example is compliant.
					[CUSTOM_GRANT]: (ctx) =>
						ctx.json(
							{
								contributed_grant: true,
								echoed: ctx.body.probe,
							},
							{
								headers: {
									"Cache-Control": "no-store",
									Pragma: "no-cache",
								},
							},
						),
					// Reuses the exported createUserTokens to mint, injecting per-request
					// claims and response fields through CreateUserTokensParams.extra.
					[CLAIMS_GRANT]: async (ctx, opts) => {
						const client = await validateClientCredentials(
							ctx,
							opts,
							ctx.body.client_id as string,
							ctx.body.client_secret as string | undefined,
							["openid"],
						);
						return createUserTokens(ctx, opts, {
							client,
							scopes: ["openid"],
							grantType: CLAIMS_GRANT,
							resources: [RESOURCE],
							extra: {
								accessTokenClaims: { probe_extra: "yes" },
								tokenResponse: { probe_response: "ok" },
							},
						});
					},
				},
				grantTypeURIs: [CUSTOM_GRANT, CLAIMS_GRANT],
				metadata: ({ baseURL }) => ({
					test_probe_endpoint: `${baseURL}/probe`,
				}),
				tokenEndpointAuthMethods: ["urn:better-auth:test:auth", ASSERTION_TYPE],
				// A contributed verifier for ASSERTION_TYPE: it authenticates the client
				// by a fixed assertion value and returns the registered client record.
				clientAuthStrategies: {
					[ASSERTION_TYPE]: async (ctx, opts) => {
						if (ctx.body.client_assertion !== "valid-attestation") {
							throw new APIError("UNAUTHORIZED", { error: "invalid_client" });
						}
						const client = await getClient(
							ctx,
							opts,
							ctx.body.client_id as string,
						);
						if (!client) {
							throw new APIError("BAD_REQUEST", { error: "invalid_client" });
						}
						return { clientId: client.clientId, client };
					},
				},
				tokenClaims: {
					access: () => ({ probe_claim: "present" }),
					// Returns a namespaced claim plus an attempt to override the
					// host-owned authentication-context claims, to prove a contributor
					// cannot redefine acr/auth_time.
					id: () => ({
						"urn:better-auth:test:id_claim": "present",
						acr: "urn:better-auth:test:forged",
						auth_time: 0,
					}),
				},
			} satisfies OAuthContributions,
		},
	} satisfies BetterAuthPlugin;
}

async function setup() {
	return getTestInstance({
		baseURL: BASE_URL,
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				// A valid audience lets client_credentials mint a JWT access token,
				// which is where contributed access-token claims are applied.
				validAudiences: [RESOURCE],
				silenceWarnings: { oauthAuthServerConfig: true, openidConfig: true },
			}),
			contributionProbe(),
		],
	});
}

describe("oauth-provider contribution surface", () => {
	it("dispatches a contributed grant type and preserves passthrough body params", async () => {
		const { auth } = await setup();
		const response = await auth.handler(
			new Request(TOKEN_URL, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: CUSTOM_GRANT,
					probe: "hello",
				}).toString(),
			}),
		);
		expect(response.status).toBe(200);
		// The handler sets the RFC 6749 §5.1 cache headers via ctx.json so the
		// canonical GrantHandler example is compliant. Their propagation to the
		// wire is owned by better-call and is identical for the built-in grants,
		// so it is not re-asserted here.
		const body = (await response.json()) as {
			contributed_grant?: boolean;
			echoed?: string;
		};
		expect(body.contributed_grant).toBe(true);
		expect(body.echoed).toBe("hello");
	});

	it("rejects an unregistered grant type with unsupported_grant_type", async () => {
		const { auth } = await setup();
		const response = await auth.handler(
			new Request(TOKEN_URL, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "urn:better-auth:test:unregistered",
				}).toString(),
			}),
		);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { error?: string };
		expect(body.error).toBe("unsupported_grant_type");
	});

	it("advertises the contributed grant URI, metadata, and auth method in discovery", async () => {
		const { auth } = await setup();
		const response = await auth.handler(new Request(METADATA_URL));
		expect(response.status).toBe(200);
		const metadata = (await response.json()) as {
			grant_types_supported?: string[];
			token_endpoint_auth_methods_supported?: string[];
			test_probe_endpoint?: string;
		};
		expect(metadata.grant_types_supported).toContain(CUSTOM_GRANT);
		expect(metadata.token_endpoint_auth_methods_supported).toContain(
			"urn:better-auth:test:auth",
		);
		expect(metadata.test_probe_endpoint).toBe(`${BASE_URL}/api/auth/probe`);
	});

	it("merges contributed token claims into a minted access token", async () => {
		const { auth, signInWithTestUser } = await setup();
		const { headers } = await signInWithTestUser();
		const client = await auth.api.adminCreateOAuthClient({
			headers,
			body: { redirect_uris: ["http://localhost:3000/cb"], skip_consent: true },
		});
		const response = await auth.handler(
			new Request(TOKEN_URL, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "client_credentials",
					client_id: client!.client_id,
					client_secret: client!.client_secret!,
					resource: RESOURCE,
				}).toString(),
			}),
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { access_token?: string };
		expect(body.access_token).toBeDefined();
		const claims = decodeJwt(body.access_token!);
		expect(claims.probe_claim).toBe("present");
	});

	it("re-derives contributed access claims for an opaque token at introspection", async () => {
		const { auth, signInWithTestUser } = await setup();
		const { headers } = await signInWithTestUser();
		const client = await auth.api.adminCreateOAuthClient({
			headers,
			body: { redirect_uris: ["http://localhost:3000/cb"], skip_consent: true },
		});
		// No `resource` param, so client_credentials mints an opaque access token.
		// Opaque tokens store no claims, so the contributed claim must be produced
		// by introspection re-deriving it rather than read back from a JWT.
		const tokenResponse = await auth.handler(
			new Request(TOKEN_URL, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "client_credentials",
					client_id: client!.client_id,
					client_secret: client!.client_secret!,
				}).toString(),
			}),
		);
		expect(tokenResponse.status).toBe(200);
		const { access_token } = (await tokenResponse.json()) as {
			access_token: string;
		};
		// Opaque tokens are not JWTs.
		expect(() => decodeJwt(access_token)).toThrow();

		const introspectResponse = await auth.handler(
			new Request(INTROSPECT_URL, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					client_id: client!.client_id,
					client_secret: client!.client_secret!,
					token: access_token,
				}).toString(),
			}),
		);
		expect(introspectResponse.status).toBe(200);
		const introspection = (await introspectResponse.json()) as {
			active?: boolean;
			probe_claim?: string;
		};
		expect(introspection.active).toBe(true);
		expect(introspection.probe_claim).toBe("present");
	});

	it("lets a contributor add an id-token claim but never override acr/auth_time", async () => {
		const { auth, signInWithTestUser, customFetchImpl } = await setup();
		const { headers } = await signInWithTestUser();
		const oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [`${BASE_URL}/cb`],
				skip_consent: true,
			},
		});
		const client = createAuthClient({
			plugins: [oauthProviderClient(), jwtClient()],
			baseURL: BASE_URL,
			fetchOptions: { customFetchImpl, headers },
		});

		const codeVerifier = generateRandomString(32);
		const url = await createAuthorizationURL({
			id: "test",
			options: {
				clientId: oauthClient!.client_id,
				clientSecret: oauthClient!.client_secret!,
				redirectURI: `${BASE_URL}/cb`,
			},
			redirectURI: "",
			authorizationEndpoint: `${BASE_URL}/api/auth/oauth2/authorize`,
			state: "state",
			scopes: ["openid", "profile"],
			codeVerifier,
		});
		let location = "";
		await client.$fetch(url.toString(), {
			onError(context) {
				location = context.response.headers.get("Location") || "";
			},
		});
		const code = new URL(location).searchParams.get("code");
		expect(code).toBeTruthy();

		const { body, headers: tokenHeaders } = await authorizationCodeRequest({
			code: code!,
			codeVerifier,
			redirectURI: `${BASE_URL}/cb`,
			options: {
				clientId: oauthClient!.client_id,
				clientSecret: oauthClient!.client_secret!,
				redirectURI: `${BASE_URL}/cb`,
			},
		});
		const tokens = await client.$fetch<{ id_token?: string }>("/oauth2/token", {
			method: "POST",
			body,
			headers: tokenHeaders,
		});
		expect(tokens.data?.id_token).toBeDefined();
		const claims = decodeJwt(tokens.data!.id_token!);
		// The contributor's namespaced claim is merged.
		expect(claims["urn:better-auth:test:id_claim"]).toBe("present");
		// But its attempt to override the host-owned authentication-context claims
		// is ignored: acr keeps the host default and auth_time is the real value.
		expect(claims.acr).toBe("urn:mace:incommon:iap:bronze");
		expect(claims.auth_time).not.toBe(0);
	});

	it("exports the grant-author token-minting helper", () => {
		expect(typeof createUserTokens).toBe("function");
	});

	it("lets a custom grant inject per-request claims and response fields via createUserTokens", async () => {
		const { auth, signInWithTestUser } = await setup();
		const { headers } = await signInWithTestUser();
		const client = await auth.api.adminCreateOAuthClient({
			headers,
			body: { redirect_uris: ["http://localhost:3000/cb"], skip_consent: true },
		});
		const response = await auth.handler(
			new Request(TOKEN_URL, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: CLAIMS_GRANT,
					client_id: client!.client_id,
					client_secret: client!.client_secret!,
					resource: RESOURCE,
				}).toString(),
			}),
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			access_token?: string;
			probe_response?: string;
		};
		expect(body.probe_response).toBe("ok");
		expect(decodeJwt(body.access_token!).probe_extra).toBe("yes");
	});

	it("authenticates the client through a contributed client-auth strategy", async () => {
		const { auth, signInWithTestUser } = await setup();
		const { headers } = await signInWithTestUser();
		const client = await auth.api.adminCreateOAuthClient({
			headers,
			body: { redirect_uris: ["http://localhost:3000/cb"], skip_consent: true },
		});
		const response = await auth.handler(
			new Request(TOKEN_URL, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "client_credentials",
					client_id: client!.client_id,
					client_assertion_type: ASSERTION_TYPE,
					client_assertion: "valid-attestation",
					resource: RESOURCE,
				}).toString(),
			}),
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { access_token?: string };
		expect(body.access_token).toBeDefined();
	});

	it("rejects a contributed client-auth strategy when the assertion is invalid", async () => {
		const { auth, signInWithTestUser } = await setup();
		const { headers } = await signInWithTestUser();
		const client = await auth.api.adminCreateOAuthClient({
			headers,
			body: { redirect_uris: ["http://localhost:3000/cb"], skip_consent: true },
		});
		const response = await auth.handler(
			new Request(TOKEN_URL, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "client_credentials",
					client_id: client!.client_id,
					client_assertion_type: ASSERTION_TYPE,
					client_assertion: "forged",
					resource: RESOURCE,
				}).toString(),
			}),
		);
		expect(response.status).toBe(401);
		expect(((await response.json()) as { error?: string }).error).toBe(
			"invalid_client",
		);
	});
});

describe("oauth-provider contribution init validation", () => {
	function initWith(...plugins: BetterAuthPlugin[]) {
		return getTestInstance({
			baseURL: BASE_URL,
			plugins: [
				jwt(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					silenceWarnings: { oauthAuthServerConfig: true, openidConfig: true },
				}),
				...plugins,
			],
		});
	}
	const noop = (ctx: { json: (b: unknown) => Response }) => ctx.json({});

	it("throws when two plugins register the same grant URI", async () => {
		const a = {
			id: "grant-a",
			contributes: {
				"oauth-provider": {
					grantTypes: { [CUSTOM_GRANT]: noop },
					grantTypeURIs: [CUSTOM_GRANT],
				},
			},
		} satisfies BetterAuthPlugin;
		const b = {
			id: "grant-b",
			contributes: {
				"oauth-provider": {
					grantTypes: { [CUSTOM_GRANT]: noop },
					grantTypeURIs: [CUSTOM_GRANT],
				},
			},
		} satisfies BetterAuthPlugin;
		await expect(initWith(a, b)).rejects.toThrow(/Conflicting grant type/);
	});

	it("throws when a grant URI is advertised without a handler", async () => {
		const orphan = {
			id: "orphan-uri",
			contributes: {
				"oauth-provider": { grantTypeURIs: ["urn:better-auth:test:orphan"] },
			},
		} satisfies BetterAuthPlugin;
		await expect(initWith(orphan)).rejects.toThrow(/no handler in grantTypes/);
	});

	it("throws when a handler is registered without advertising its URI", async () => {
		const hidden = {
			id: "hidden-handler",
			contributes: {
				"oauth-provider": {
					grantTypes: { "urn:better-auth:test:hidden": noop },
				},
			},
		} satisfies BetterAuthPlugin;
		await expect(initWith(hidden)).rejects.toThrow(
			/missing from grantTypeURIs/,
		);
	});

	it("throws when a contributed grant type is not an absolute URI", async () => {
		const relative = {
			id: "relative-grant",
			contributes: {
				"oauth-provider": {
					grantTypes: { foo: noop },
					grantTypeURIs: ["foo"],
				},
			},
		} satisfies BetterAuthPlugin;
		await expect(initWith(relative)).rejects.toThrow(/must be an absolute URI/);
	});
});
