import { APIError } from "better-auth/api";
import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
} from "better-auth/oauth2";
import { bearer } from "better-auth/plugins";
import { jwt } from "better-auth/plugins/jwt";
import type { Organization } from "better-auth/plugins/organization";
import { organization } from "better-auth/plugins/organization";
import { getTestInstance } from "better-auth/test";
import { beforeAll, describe, expect, it, onTestFinished, vi } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import { resetSeedStateForTests } from "./resources";
import type { OAuthOptions } from "./types";
import type { OAuthClient } from "./types/oauth";

describe("oauth register", async () => {
	const baseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: baseUrl,
		plugins: [
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				allowDynamicClientRegistration: true,
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
				scopes: [
					"openid",
					"profile",
					"email",
					"offline_access",
					"create:test",
					"delete:test",
				],
			}),
			jwt(),
		],
	});
	const { headers } = await signInWithTestUser();
	const serverClient = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: baseUrl,
		fetchOptions: {
			customFetchImpl,
			headers,
		},
	});

	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/callback/${providerId}`;

	it("should fail without body", async () => {
		const response = await serverClient.$fetch("/oauth2/register", {
			method: "POST",
		});
		expect(response.error?.status).toBe(400);
	});

	it("should fail without authentication", async () => {
		const unauthenticatedClient = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: baseUrl,
			fetchOptions: {
				customFetchImpl,
			},
		});
		const response = await unauthenticatedClient.oauth2.register({
			redirect_uris: [redirectUri],
		});
		expect(response.error?.status).toBe(401);
	});

	it("should reject unauthenticated registration before metadata validation", async () => {
		const unauthenticatedClient = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: baseUrl,
			fetchOptions: {
				customFetchImpl,
			},
		});
		const response = await unauthenticatedClient.oauth2.register({
			redirect_uris: [redirectUri],
			token_endpoint_auth_method: "not_a_real_method",
		});
		expect(response.error?.status).toBe(401);
	});

	it("should register private client with minimum requirements", async () => {
		const response = await serverClient.oauth2.register({
			redirect_uris: [redirectUri],
		});
		expect(response.data?.client_id).toBeDefined();
		expect(response.data?.user_id).toBeDefined();
		expect(response.data?.client_secret).toBeDefined();
	});

	it("should fail authorization_code without response type code", async () => {
		const response = await serverClient.oauth2.register({
			// @ts-expect-error testing with a different response type even though unsupported
			response_types: ["token"],
			redirect_uris: [redirectUri],
		});
		expect(response.error?.status).toBe(400);
	});

	it("should fail type check for public client request", async () => {
		const response = await serverClient.oauth2.register({
			token_endpoint_auth_method: "none",
			type: "web",
			redirect_uris: [redirectUri],
		});
		expect(response.error?.status).toBe(400);
	});

	it.for([
		"native",
		"user-agent-based",
	] as OAuthClient["type"][])("should fail with type '%s' check for confidential client request", async (type) => {
		const response = await serverClient.oauth2.register({
			token_endpoint_auth_method: "client_secret_post",
			type,
			redirect_uris: [redirectUri],
		});
		expect(response.error?.status).toBe(400);
	});

	it.for([
		"native",
		"user-agent-based",
	] as OAuthClient["type"][])("should register public '%s' client with minimum requirements via server", async (type) => {
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "none",
				redirect_uris: [redirectUri],
				type,
			},
		});
		expect(response?.client_id).toBeDefined();
		expect(response?.user_id).toBeDefined();
		expect(response?.client_secret).toBeUndefined();
	});

	it("should register confidential client and check that certain fields are overwritten", async () => {
		const applicationRequest: OAuthClient = {
			client_id: "bad-actor",
			client_secret: "bad-actor",
			client_secret_expires_at: 0,
			scope: "create:test delete:test",
			//---- Recommended client data ----//
			user_id: "bad-actor",
			client_id_issued_at: Math.floor(Date.now() / 1000),
			//---- UI Metadata ----//
			client_name: "accept name",
			client_uri: "https://example.com/ok",
			logo_uri: "https://example.com/logo.png",
			contacts: ["test@example.com"],
			tos_uri: "https://example.com/terms",
			policy_uri: "https://example.com/policy",
			//---- Client key metadata (only one can be used) ----//
			// jwks: [],
			// jwks_uri: "https://example.com/.well-known/jwks.json",
			//---- User Software Identifiers ----//
			software_id: "custom-software-id",
			software_version: "custom-v1",
			software_statement: "custom software statement",
			//---- Authentication Metadata ----//
			redirect_uris: ["https://example.com/callback"],
			token_endpoint_auth_method: "client_secret_post",
			grant_types: [
				"authorization_code",
				"client_credentials",
				"refresh_token",
			],
			response_types: ["code"],
			//---- RFC6749 Spec ----//
			public: true, // test never set on this (based off of token_endpoint_auth_method)
			type: "web",
			//---- Not Part of RFC7591 Spec ----//
			disabled: false,
		};
		const response = await serverClient.$fetch<OAuthClient>(
			"/oauth2/register",
			{
				method: "POST",
				body: applicationRequest,
			},
		);

		expect(response.data?.client_id).toBeDefined();
		expect(response.data?.client_id).not.toEqual(applicationRequest.client_id);
		expect(response.data?.client_secret).toBeDefined();
		expect(response.data?.client_secret).not.toEqual(
			applicationRequest.client_secret,
		);
		expect(response.data?.client_secret_expires_at).toEqual(0);
		expect(response.data?.scope).toBe(applicationRequest.scope);

		expect(response.data?.user_id).toBeDefined();
		expect(response.data?.user_id).not.toEqual(applicationRequest.user_id);
		expect(response.data?.client_id_issued_at).toBeDefined();

		expect(response.data).toMatchObject({
			client_name: applicationRequest.client_name,
			client_uri: applicationRequest.client_uri,
			logo_uri: applicationRequest.logo_uri,
			contacts: applicationRequest.contacts,
			tos_uri: applicationRequest.tos_uri,
			policy_uri: applicationRequest.policy_uri,
		});

		expect(response.data?.jwks).toBeUndefined();
		expect(response.data?.jwks_uri).toBeUndefined();

		expect(response.data).toMatchObject({
			software_id: applicationRequest.software_id,
			software_version: applicationRequest.software_version,
			software_statement: applicationRequest.software_statement,
			redirect_uris: applicationRequest.redirect_uris,
			token_endpoint_auth_method: applicationRequest.token_endpoint_auth_method,
			grant_types: applicationRequest.grant_types,
			response_types: applicationRequest.response_types,
		});

		expect(response.data?.public).toBeFalsy();

		expect(response.data?.disabled).toBeFalsy();
	});

	it("should preserve confidential method and type for authenticated registration", async () => {
		const response = await serverClient.oauth2.register({
			token_endpoint_auth_method: "client_secret_post",
			type: "web",
			redirect_uris: [redirectUri],
		});
		expect(response.data?.client_id).toBeDefined();
		expect(response.data?.client_secret).toBeDefined();
		expect(response.data?.token_endpoint_auth_method).toBe(
			"client_secret_post",
		);
		expect(response.data?.type).toBe("web");
		expect(response.data?.public).toBeFalsy();
	});

	it("dedupes repeated DCR resources to a single client/resource link row", async () => {
		const identifier = "https://api.example.com/dcr-dedupe";
		await auth.api.adminCreateOAuthResource({
			headers,
			body: { identifier },
		});

		// A client that lists the same resource twice must not produce two
		// link rows: the deterministic `${clientId}::${resourceId}` id makes
		// the second insert a no-op via the PK uniqueness constraint.
		const response = await serverClient.$fetch<
			OAuthClient & { resources?: string[] }
		>("/oauth2/register", {
			method: "POST",
			body: {
				redirect_uris: [redirectUri],
				resources: [identifier, identifier],
			},
		});
		const clientId = response.data?.client_id;
		expect(clientId).toBeDefined();

		const ctx = await auth.$context;
		const links = await ctx.adapter.findMany({
			model: "oauthClientResource",
			where: [{ field: "clientId", value: clientId! }],
		});
		expect(links.length).toBe(1);
	});

	it("rejects a registration resource that is not a valid RFC 8707 URI", async () => {
		const response = await serverClient.$fetch<OAuthClient>(
			"/oauth2/register",
			{
				method: "POST",
				body: {
					redirect_uris: [redirectUri],
					resources: ["not-a-uri"],
				},
			},
		);
		expect(response.error?.status).toBe(400);
		expect((response.error as { error?: string } | null)?.error).toBe(
			"invalid_target",
		);
	});

	it("lazy-seeds configured resources before DCR validation", async () => {
		const identifier = "https://api.example.com/dcr-lazy-seed";
		const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance(
			{
				baseURL: baseUrl,
				plugins: [
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						allowDynamicClientRegistration: true,
						resources: [identifier],
						silenceWarnings: {
							oauthAuthServerConfig: true,
							openidConfig: true,
						},
					}),
					jwt(),
				],
			},
		);
		const ctx = await auth.$context;
		await ctx.adapter.delete({
			model: "oauthResource",
			where: [{ field: "identifier", value: identifier }],
		});
		resetSeedStateForTests();
		const { headers } = await signInWithTestUser();
		const client = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: baseUrl,
			fetchOptions: {
				customFetchImpl,
				headers,
			},
		});

		const response = await client.$fetch<
			OAuthClient & { resources?: string[] }
		>("/oauth2/register", {
			method: "POST",
			body: {
				redirect_uris: [redirectUri],
				resources: [identifier],
			},
		});

		expect(response.error).toBeNull();
		expect(response.data?.resources).toEqual([identifier]);
	});

	it("should register client with metadata field", async () => {
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				metadata: {
					foo: "bar",
					nested: { key: "value" },
				},
			},
		});
		expect(response?.client_id).toBeDefined();
		expect(response?.client_secret).toBeDefined();
		// Metadata should be spread at the top level of the response
		expect(response?.foo).toBe("bar");
		expect(response?.nested).toEqual({ key: "value" });
	});

	it("should reject registration with an empty jwks array", async () => {
		const response = await serverClient.oauth2.register({
			redirect_uris: [redirectUri],
			token_endpoint_auth_method: "private_key_jwt",
			jwks: [] as Record<string, unknown>[],
		});
		expect(response.error?.status).toBe(400);
	});

	it("should reject registration with an empty jwks.keys array", async () => {
		const response = await serverClient.oauth2.register({
			redirect_uris: [redirectUri],
			token_endpoint_auth_method: "private_key_jwt",
			jwks: { keys: [] } as { keys: Record<string, unknown>[] },
		});
		expect(response.error?.status).toBe(400);
	});

	it.for([
		{ kty: "oct", k: "secret-key" },
		{ kty: "RSA", n: "test", e: "test-exponent", d: "private-exponent" },
	])("should reject private or symmetric jwks material", async (key) => {
		const response = await serverClient.oauth2.register({
			redirect_uris: [redirectUri],
			jwks: { keys: [key] },
		});
		expect(response.error?.status).toBe(400);
	});

	it("should reject admin registration with an empty jwks array", async () => {
		await expect(
			auth.api.adminCreateOAuthClient({
				headers,
				body: {
					redirect_uris: [redirectUri],
					token_endpoint_auth_method: "private_key_jwt",
					jwks: [] as Record<string, unknown>[],
				},
			}),
		).rejects.toThrow();
	});

	it("should register client with metadata and strip extra fields not in schema", async () => {
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				metadata: {
					fromMetadata: "value1",
				},
				customField: "value2",
			} as any,
		});
		expect(response?.client_id).toBeDefined();
		// metadata contents should be spread at the top level, extra fields not in schema should be stripped
		expect(response?.fromMetadata).toBe("value1");
		expect(response?.customField).toBe(undefined);
	});

	it("round-trips backchannel_logout_uri and backchannel_logout_session_required", async () => {
		const backchannelUri = `${rpBaseUrl}/logout/backchannel`;
		const response = await serverClient.oauth2.register({
			redirect_uris: [redirectUri],
			backchannel_logout_uri: backchannelUri,
			backchannel_logout_session_required: true,
		});
		expect(response.data?.client_id).toBeDefined();
		expect(response.data?.backchannel_logout_uri).toBe(backchannelUri);
		expect(response.data?.backchannel_logout_session_required).toBe(true);
	});

	it("rejects backchannel_logout_uri with a fragment", async () => {
		const response = await serverClient.oauth2.register({
			redirect_uris: [redirectUri],
			backchannel_logout_uri: `${rpBaseUrl}/logout/backchannel#section`,
		});
		expect(response.error?.status).toBe(400);
	});

	it("rejects backchannel_logout_uri ending with a bare fragment delimiter", async () => {
		// `new URL(...).hash` is empty for a trailing `#`, so the raw value must
		// be checked to honor spec §2.2 (no fragment component).
		const response = await serverClient.oauth2.register({
			redirect_uris: [redirectUri],
			backchannel_logout_uri: `${rpBaseUrl}/logout/backchannel#`,
		});
		expect(response.error?.status).toBe(400);
	});

	it("rejects http backchannel_logout_uri on confidential clients", async () => {
		const response = await serverClient.oauth2.register({
			redirect_uris: [redirectUri],
			backchannel_logout_uri: "http://rp.example.com/logout/backchannel",
		});
		expect(response.error?.status).toBe(400);
	});

	it("allows http backchannel_logout_uri on public clients", async () => {
		const response = await serverClient.oauth2.register({
			redirect_uris: [redirectUri],
			token_endpoint_auth_method: "none",
			type: "native",
			backchannel_logout_uri: `${rpBaseUrl}/logout/backchannel`,
		});
		expect(response.data?.client_id).toBeDefined();
		expect(response.data?.backchannel_logout_uri).toBe(
			`${rpBaseUrl}/logout/backchannel`,
		);
	});

	it("rejects backchannel_logout_uri pointing at private, tunneled, or metadata targets", async () => {
		// These all pass a naive https check but are non-public; the guard must
		// reject every encoding, not just dotted-decimal private IPs.
		const targets = [
			"https://10.0.0.1/logout",
			"https://169.254.169.254/logout",
			"https://[::ffff:169.254.169.254]/logout",
			"https://[64:ff9b::a9fe:a9fe]/logout",
			"https://100.64.0.1/logout",
			"https://metadata.google.internal/logout",
		];
		for (const backchannel_logout_uri of targets) {
			const response = await serverClient.oauth2.register({
				redirect_uris: [redirectUri],
				backchannel_logout_uri,
			});
			expect(response.error?.status).toBe(400);
		}
	});
});

describe("oauth register - disableJwtPlugin", async () => {
	const baseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const { signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: baseUrl,
		plugins: [
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				allowDynamicClientRegistration: true,
				disableJwtPlugin: true,
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
		],
	});
	const { headers } = await signInWithTestUser();
	const serverClient = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: baseUrl,
		fetchOptions: { customFetchImpl, headers },
	});

	it("rejects backchannel_logout_uri when jwt plugin is disabled", async () => {
		const response = await serverClient.oauth2.register({
			redirect_uris: [`${rpBaseUrl}/callback`],
			backchannel_logout_uri: `${rpBaseUrl}/logout/backchannel`,
		});
		expect(response.error?.status).toBe(400);
	});
});

describe("oauth register - unauthenticated", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const { customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				allowDynamicClientRegistration: true,
				allowUnauthenticatedClientRegistration: true,
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
		],
	});
	const unauthenticatedClient = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: authServerBaseUrl,
		fetchOptions: {
			customFetchImpl,
		},
	});

	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/callback/${providerId}`;

	it("should create public clients without authentication", async () => {
		const response = await unauthenticatedClient.oauth2.register({
			token_endpoint_auth_method: "none",
			redirect_uris: [redirectUri],
		});
		expect(response.data?.client_id).toBeDefined();
		expect(response.data?.user_id).toBeUndefined();
		expect(response.data?.client_secret).toBeUndefined();
	});

	/**
	 * RFC 7591 §2: when token_endpoint_auth_method is omitted, the default
	 * is "client_secret_basic". Open registration may still create a
	 * confidential client and return the generated client_secret.
	 *
	 * @see https://github.com/better-auth/better-auth/issues/8588
	 */
	it("should apply the client_secret_basic default without authentication", async () => {
		const response = await unauthenticatedClient.oauth2.register({
			redirect_uris: [redirectUri],
		});
		expect(response.data?.client_id).toBeDefined();
		expect(response.data?.client_secret).toBeDefined();
		expect(response.data?.token_endpoint_auth_method).toBe(
			"client_secret_basic",
		);
		expect(response.data?.public).toBe(false);
	});

	/**
	 * Open registration preserves the requested confidential client auth method
	 * and returns a secret for token endpoint authentication.
	 *
	 * @see https://github.com/better-auth/better-auth/issues/8588
	 */
	it("should preserve client_secret_post for unauthenticated DCR", async () => {
		const response = await unauthenticatedClient.oauth2.register({
			token_endpoint_auth_method: "client_secret_post",
			redirect_uris: [redirectUri],
		});
		expect(response.data?.client_id).toBeDefined();
		expect(response.data?.client_secret).toBeDefined();
		expect(response.data?.token_endpoint_auth_method).toBe(
			"client_secret_post",
		);
		expect(response.data?.public).toBe(false);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8588
	 */
	it("should accept client_secret_basic with inline jwks for unauthenticated DCR", async () => {
		const jwks = {
			keys: [{ kty: "RSA", kid: "client-key", n: "test", e: "test-exponent" }],
		};
		const response = await unauthenticatedClient.oauth2.register({
			token_endpoint_auth_method: "client_secret_basic",
			redirect_uris: [redirectUri],
			jwks,
		});
		expect(response.data?.client_id).toBeDefined();
		expect(response.data?.client_secret).toBeDefined();
		expect(response.data?.token_endpoint_auth_method).toBe(
			"client_secret_basic",
		);
		expect(response.data?.jwks).toEqual(jwks);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8588
	 */
	it("should preserve type 'web' for unauthenticated confidential DCR", async () => {
		const response = await unauthenticatedClient.oauth2.register({
			token_endpoint_auth_method: "client_secret_post",
			type: "web",
			redirect_uris: [redirectUri],
		});
		expect(response.data?.client_id).toBeDefined();
		expect(response.data?.client_secret).toBeDefined();
		expect(response.data?.token_endpoint_auth_method).toBe(
			"client_secret_post",
		);
		expect(response.data?.type).toBe("web");
	});

	/**
	 * client_credentials can mint tokens without an end-user authorization step.
	 * Keep open registration on authorization-code clients unless the caller is
	 * authenticated through a session or an initial access token.
	 *
	 * @see https://github.com/better-auth/better-auth/issues/8588
	 */
	it("should reject client_credentials grant for unauthenticated DCR", async () => {
		const response = await unauthenticatedClient.oauth2.register({
			grant_types: ["client_credentials"],
			redirect_uris: [redirectUri],
		});
		expect(response.error?.status).toBe(400);
	});
});

/**
 * Verifies the open-registration confidential client is actually usable end-to-end:
 * DCR with client_secret_post -> authorize -> PKCE token exchange with client_secret.
 *
 * @see https://github.com/better-auth/better-auth/issues/8588
 */
describe("oauth register - unauthenticated DCR full flow", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const { signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				allowDynamicClientRegistration: true,
				allowUnauthenticatedClientRegistration: true,
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
		],
	});

	const { headers } = await signInWithTestUser();
	const authenticatedClient = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: authServerBaseUrl,
		fetchOptions: { customFetchImpl, headers },
	});
	const unauthenticatedClient = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: authServerBaseUrl,
		fetchOptions: { customFetchImpl },
	});

	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;
	const state = "e2e-test-state";

	it("should complete authorize + PKCE token exchange for client_secret_post", async () => {
		// 1. Register via unauthenticated DCR with client_secret_post.
		const reg = await unauthenticatedClient.oauth2.register({
			token_endpoint_auth_method: "client_secret_post",
			redirect_uris: [redirectUri],
		});
		expect(reg.data?.client_id).toBeDefined();
		expect(reg.data?.client_secret).toBeDefined();
		expect(reg.data?.token_endpoint_auth_method).toBe("client_secret_post");

		const clientId = reg.data!.client_id;
		const clientSecret = reg.data!.client_secret!;

		// 2. Build authorization URL with PKCE (no client secret)
		const codeVerifier = generateRandomString(64);
		const authUrl = await createAuthorizationURL({
			id: providerId,
			options: {
				clientId,
				redirectURI: redirectUri,
			},
			redirectURI: "",
			authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
			state,
			scopes: ["openid"],
			codeVerifier,
		});

		// 3. Hit authorize endpoint (with user session) -> consent redirect
		let consentRedirectUrl = "";
		await authenticatedClient.$fetch(authUrl.toString(), {
			onError(ctx) {
				consentRedirectUrl = ctx.response.headers.get("Location") || "";
			},
		});
		expect(consentRedirectUrl).toContain("/consent");

		// 4. Accept consent -> get authorization code
		vi.stubGlobal("window", {
			location: {
				search: new URL(consentRedirectUrl, authServerBaseUrl).search,
			},
		});
		onTestFinished(() => {
			vi.unstubAllGlobals();
		});

		const consentRes = await authenticatedClient.oauth2.consent(
			{ accept: true },
			{ headers, throw: true },
		);
		expect(consentRes.url).toContain("code=");

		const code = new URL(consentRes.url).searchParams.get("code")!;

		// 5. Exchange code at token endpoint with PKCE and client_secret_post.
		const { body: tokenBody, headers: tokenHeaders } =
			await authorizationCodeRequest({
				code,
				codeVerifier,
				redirectURI: redirectUri,
				options: {
					clientId,
					clientSecret,
					redirectURI: redirectUri,
				},
			});

		const tokenRes = await customFetchImpl(
			`${authServerBaseUrl}/api/auth/oauth2/token`,
			{
				method: "POST",
				body: tokenBody.toString(),
				headers: tokenHeaders,
			},
		);
		const tokens = await tokenRes.json();

		expect(tokens.access_token).toBeDefined();
		expect(tokens.id_token).toBeDefined();
		expect(tokens.token_type.toLowerCase()).toBe("bearer");
		expect(tokens.scope).toBe("openid");
	});
});

describe("oauth register - organization", async () => {
	const providerId = "test";
	const baseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const redirectUri = `${rpBaseUrl}/api/auth/callback/${providerId}`;
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: baseUrl,
		plugins: [
			organization(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				allowDynamicClientRegistration: true,
				clientReference({ session }) {
					return (
						(session?.activeOrganizationId as string | undefined) ?? undefined
					);
				},
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
			jwt(),
		],
	});

	const { headers, user } = await signInWithTestUser();
	const serverClient = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: baseUrl,
		fetchOptions: {
			customFetchImpl,
			headers,
		},
	});

	let org: Organization;
	beforeAll(async () => {
		const _org = await auth.api.createOrganization({
			body: {
				name: "my-org",
				slug: "my-org",
				userId: user.id,
			},
		});
		expect(_org).toBeDefined();
		org = _org!;
		await serverClient.$fetch("/organization/set-active", {
			method: "POST",
			body: {
				organizationId: org.id,
				organizationSlug: org.slug,
			},
			headers,
			throw: true,
		});
		const session = await serverClient.getSession({
			fetchOptions: {
				headers,
			},
		});
		const sessionData = session.data?.session as
			| { activeOrganizationId?: string }
			| undefined;
		expect(sessionData?.activeOrganizationId).toBe(org?.id);
	});

	it("should create organizational oauthClient", async () => {
		const client = await serverClient.oauth2.register({
			redirect_uris: [redirectUri],
		});
		expect(client.data?.user_id).toBeUndefined();
		expect(client.data?.reference_id).toBe(org.id);
	});
});

describe("oauth register - skip_consent blocked", async () => {
	const baseUrl = "http://localhost:3000";
	const { signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: baseUrl,
		plugins: [
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				allowDynamicClientRegistration: true,
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
			jwt(),
		],
	});
	const { headers } = await signInWithTestUser();
	const serverClient = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: baseUrl,
		fetchOptions: { customFetchImpl, headers },
	});

	it("should reject skip_consent during dynamic registration", async () => {
		const res = await serverClient.oauth2.register({
			redirect_uris: ["http://localhost:5000/callback"],
			// @ts-expect-error testing skip consent mimicing client incorrectly sending parameter
			skip_consent: true,
		});
		expect(res.error?.status).toBe(400);
	});

	it("should allow registration without skip_consent", async () => {
		const res = await serverClient.oauth2.register({
			redirect_uris: ["http://localhost:5000/callback"],
		});
		expect(res.data?.client_id).toBeDefined();
	});
});

describe("oauth register - protected dynamic registration", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const validInitialAccessToken = "valid-initial-registration-token";
	const validateInitialAccessToken = vi.fn<
		NonNullable<OAuthOptions["validateInitialAccessToken"]>
	>(({ initialAccessToken, clientMetadata }) => {
		if (
			initialAccessToken === validInitialAccessToken &&
			clientMetadata.client_name === "Machine Client"
		) {
			return { referenceId: "infra-provisioner" };
		}

		return false;
	});
	const { customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				allowDynamicClientRegistration: true,
				validateInitialAccessToken,
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
		],
	});

	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/callback/${providerId}`;

	it("should create confidential clients with a valid initial access token", async () => {
		const response = await customFetchImpl(
			`${authServerBaseUrl}/api/auth/oauth2/register`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${validInitialAccessToken}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					client_name: "Machine Client",
					redirect_uris: [redirectUri],
					grant_types: ["client_credentials"],
				}),
			},
		);
		expect(response.status).toBe(201);
		// The success response carries a client_secret, so it must not be cached.
		expect(response.headers.get("Cache-Control")).toBe("no-store");

		const body = (await response.json()) as OAuthClient;
		expect(body.client_id).toBeDefined();
		expect(body.client_secret).toBeDefined();
		expect(body.grant_types).toEqual(["client_credentials"]);
		expect(body.reference_id).toBe("infra-provisioner");
		expect(body.user_id).toBeUndefined();
		expect(body.token_endpoint_auth_method).toBe("client_secret_basic");
		expect(validateInitialAccessToken).toHaveBeenCalledWith(
			expect.objectContaining({
				initialAccessToken: validInitialAccessToken,
				clientMetadata: expect.objectContaining({
					client_name: "Machine Client",
					grant_types: ["client_credentials"],
				}),
			}),
		);
	});

	it("should reject invalid initial access tokens", async () => {
		const response = await customFetchImpl(
			`${authServerBaseUrl}/api/auth/oauth2/register`,
			{
				method: "POST",
				headers: {
					authorization: "Bearer invalid-initial-registration-token",
					"content-type": "application/json",
				},
				body: JSON.stringify({
					client_name: "Machine Client",
					redirect_uris: [redirectUri],
				}),
			},
		);
		expect(response.status).toBe(401);
		expect(response.headers.get("WWW-Authenticate")).toBe(
			'Bearer error="invalid_token"',
		);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(response.headers.get("Pragma")).toBe("no-cache");

		const body = (await response.json()) as { error?: string };
		expect(body.error).toBe("invalid_token");
	});

	it("should reject malformed initial access token headers", async () => {
		const response = await customFetchImpl(
			`${authServerBaseUrl}/api/auth/oauth2/register`,
			{
				method: "POST",
				headers: {
					authorization: "Bearer",
					"content-type": "application/json",
				},
				body: JSON.stringify({
					client_name: "Machine Client",
					redirect_uris: [redirectUri],
				}),
			},
		);
		expect(response.status).toBe(400);
		expect(response.headers.get("WWW-Authenticate")).toBe(
			'Bearer error="invalid_request"',
		);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(response.headers.get("Pragma")).toBe("no-cache");

		const body = (await response.json()) as { error?: string };
		expect(body.error).toBe("invalid_request");
	});

	it("should reject initial access tokens when validation is not configured", async () => {
		const noValidatorAuthServerBaseUrl = "http://localhost:3001";
		const { customFetchImpl: customFetchWithoutValidator } =
			await getTestInstance({
				baseURL: noValidatorAuthServerBaseUrl,
				plugins: [
					jwt(),
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						allowDynamicClientRegistration: true,
						silenceWarnings: {
							oauthAuthServerConfig: true,
							openidConfig: true,
						},
					}),
				],
			});

		const response = await customFetchWithoutValidator(
			`${noValidatorAuthServerBaseUrl}/api/auth/oauth2/register`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${validInitialAccessToken}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					client_name: "Machine Client",
					redirect_uris: [redirectUri],
				}),
			},
		);
		expect(response.status).toBe(401);
		expect(response.headers.get("WWW-Authenticate")).toBe(
			'Bearer error="invalid_token"',
		);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(response.headers.get("Pragma")).toBe("no-cache");

		const body = (await response.json()) as { error?: string };
		expect(body.error).toBe("invalid_token");
	});

	it("should register a confidential client_credentials client without redirect_uris", async () => {
		const response = await customFetchImpl(
			`${authServerBaseUrl}/api/auth/oauth2/register`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${validInitialAccessToken}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					client_name: "Machine Client",
					grant_types: ["client_credentials"],
				}),
			},
		);
		expect(response.status).toBe(201);

		const body = (await response.json()) as OAuthClient;
		expect(body.client_id).toBeDefined();
		expect(body.client_secret).toBeDefined();
		expect(body.grant_types).toEqual(["client_credentials"]);
	});

	it("should reject an authorization_code registration without redirect_uris", async () => {
		const response = await customFetchImpl(
			`${authServerBaseUrl}/api/auth/oauth2/register`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${validInitialAccessToken}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					client_name: "Machine Client",
					grant_types: ["authorization_code"],
				}),
			},
		);
		expect(response.status).toBe(400);

		const body = (await response.json()) as { error?: string };
		expect(body.error).toBe("invalid_redirect_uri");
	});

	it("should answer a no-credentials request with a bare Bearer challenge", async () => {
		const response = await customFetchImpl(
			`${authServerBaseUrl}/api/auth/oauth2/register`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					client_name: "Machine Client",
					redirect_uris: [redirectUri],
				}),
			},
		);
		expect(response.status).toBe(401);
		// RFC 6750 §3.1: a request with no credentials gets a bare challenge with
		// no error code.
		expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
		expect(response.headers.get("Cache-Control")).toBe("no-store");

		const body = (await response.json()) as { error?: string };
		expect(body.error).toBeUndefined();
	});

	it("should create an unowned client when the validator returns no referenceId", async () => {
		const ownerlessBaseUrl = "http://localhost:3002";
		const { customFetchImpl: ownerlessFetch } = await getTestInstance({
			baseURL: ownerlessBaseUrl,
			plugins: [
				jwt(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					allowDynamicClientRegistration: true,
					validateInitialAccessToken: () => ({}),
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
				}),
			],
		});

		const response = await ownerlessFetch(
			`${ownerlessBaseUrl}/api/auth/oauth2/register`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${validInitialAccessToken}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					client_name: "Machine Client",
					grant_types: ["client_credentials"],
				}),
			},
		);
		expect(response.status).toBe(201);

		const body = (await response.json()) as OAuthClient;
		expect(body.client_id).toBeDefined();
		expect(body.reference_id).toBeUndefined();
		expect(body.user_id).toBeUndefined();
	});

	it("should fail closed when the validator throws", async () => {
		const throwingBaseUrl = "http://localhost:3003";
		const { customFetchImpl: throwingFetch } = await getTestInstance({
			baseURL: throwingBaseUrl,
			plugins: [
				jwt(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					allowDynamicClientRegistration: true,
					validateInitialAccessToken: () => {
						throw new Error("validator failure");
					},
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
				}),
			],
		});

		const response = await throwingFetch(
			`${throwingBaseUrl}/api/auth/oauth2/register`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${validInitialAccessToken}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					client_name: "Machine Client",
					redirect_uris: [redirectUri],
				}),
			},
		);
		expect(response.status).toBe(500);
		// The validator's thrown message must not leak; it is contained as a
		// generic server_error.
		const body = (await response.json()) as {
			error?: string;
			error_description?: string;
		};
		expect(body.error).toBe("server_error");
		expect(body.error_description).not.toContain("validator failure");
	});

	it("passes through an APIError the validator throws", async () => {
		const apiErrorBaseUrl = "http://localhost:3006";
		const { customFetchImpl: apiErrorFetch } = await getTestInstance({
			baseURL: apiErrorBaseUrl,
			plugins: [
				jwt(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					allowDynamicClientRegistration: true,
					validateInitialAccessToken: () => {
						throw new APIError("FORBIDDEN", {
							error: "access_denied",
							error_description: "tenant suspended",
						});
					},
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
				}),
			],
		});

		const response = await apiErrorFetch(
			`${apiErrorBaseUrl}/api/auth/oauth2/register`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${validInitialAccessToken}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					client_name: "Machine Client",
					redirect_uris: [redirectUri],
				}),
			},
		);
		// A deliberately-thrown APIError shapes the response; it is not swallowed
		// into the generic server_error.
		expect(response.status).toBe(403);
		const body = (await response.json()) as { error?: string };
		expect(body.error).toBe("access_denied");
	});

	it("should not consult the validator for session-backed registration", async () => {
		const sessionBaseUrl = "http://localhost:3004";
		const sessionValidator = vi.fn<
			NonNullable<OAuthOptions["validateInitialAccessToken"]>
		>(() => ({ referenceId: "from-token" }));
		const {
			customFetchImpl: sessionFetch,
			signInWithTestUser: signInSessionUser,
		} = await getTestInstance({
			baseURL: sessionBaseUrl,
			plugins: [
				jwt(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					allowDynamicClientRegistration: true,
					validateInitialAccessToken: sessionValidator,
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
				}),
			],
		});
		const { headers } = await signInSessionUser();
		const sessionClient = createAuthClient({
			plugins: [oauthProviderClient()],
			baseURL: sessionBaseUrl,
			fetchOptions: { customFetchImpl: sessionFetch, headers },
		});

		// A logged-in user (session cookie, no Authorization header) registers
		// through the session path, so the initial access token validator is never
		// consulted and the client is owned by the user.
		const response = await sessionClient.oauth2.register({
			client_name: "Session Client",
			redirect_uris: [redirectUri],
		});

		expect(response.data?.client_id).toBeDefined();
		expect(sessionValidator).not.toHaveBeenCalled();
		expect(response.data?.reference_id).toBeUndefined();
		expect(response.data?.user_id).toBeDefined();
	});

	it("with the bearer plugin: a session bearer is the session, a non-session bearer is an initial access token", async () => {
		const bearerBaseUrl = "http://localhost:3005";
		const bearerIat = "bearer-precedence-initial-access-token";
		const bearerValidator = vi.fn<
			NonNullable<OAuthOptions["validateInitialAccessToken"]>
		>(({ initialAccessToken }) =>
			initialAccessToken === bearerIat
				? { referenceId: "infra-provisioner" }
				: false,
		);
		const {
			client,
			testUser,
			customFetchImpl: bearerFetch,
		} = await getTestInstance({
			baseURL: bearerBaseUrl,
			plugins: [
				bearer(),
				jwt(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					allowDynamicClientRegistration: true,
					validateInitialAccessToken: bearerValidator,
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
				}),
			],
		});

		// The bearer plugin returns the session token in the set-auth-token header.
		let sessionBearer = "";
		await client.signIn.email(
			{ email: testUser.email, password: testUser.password },
			{
				onSuccess: (ctx) => {
					sessionBearer = ctx.response.headers.get("set-auth-token") ?? "";
				},
			},
		);
		expect(sessionBearer.length).toBeGreaterThan(0);

		// A bearer that resolves to a session takes the session path: the validator
		// is not consulted and the client is owned by the user.
		const sessionResponse = await bearerFetch(
			`${bearerBaseUrl}/api/auth/oauth2/register`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${sessionBearer}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					client_name: "Session Bearer Client",
					redirect_uris: [redirectUri],
				}),
			},
		);
		expect(sessionResponse.status).toBe(201);
		expect(bearerValidator).not.toHaveBeenCalled();
		const sessionBody = (await sessionResponse.json()) as OAuthClient;
		expect(sessionBody.user_id).toBeDefined();
		expect(sessionBody.reference_id).toBeUndefined();

		// A bearer that does not resolve to a session is treated as an initial
		// access token: the validator authorizes it and tags the owner.
		const tokenResponse = await bearerFetch(
			`${bearerBaseUrl}/api/auth/oauth2/register`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${bearerIat}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					client_name: "Machine Client",
					grant_types: ["client_credentials"],
				}),
			},
		);
		expect(tokenResponse.status).toBe(201);
		expect(bearerValidator).toHaveBeenCalledWith(
			expect.objectContaining({ initialAccessToken: bearerIat }),
		);
		const tokenBody = (await tokenResponse.json()) as OAuthClient;
		expect(tokenBody.reference_id).toBe("infra-provisioner");
		expect(tokenBody.user_id).toBeUndefined();
	});
});
