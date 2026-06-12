import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import type { Organization } from "better-auth/plugins/organization";
import { organization } from "better-auth/plugins/organization";
import { getTestInstance } from "better-auth/test";
import { beforeAll, describe, expect, it, onTestFinished, vi } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import { resetSeedStateForTests } from "./resources";
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
			//---- Jwks (only one can be used) ----//
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
	 * is "client_secret_basic". Unauthenticated DCR overrides this to "none"
	 * per RFC 7591 §3.2.1 ("the server MAY reject or replace any of the
	 * client's requested metadata values").
	 *
	 * @see https://github.com/better-auth/better-auth/issues/8588
	 */
	it("should override omitted auth method (RFC 7591 default) to public", async () => {
		const response = await unauthenticatedClient.oauth2.register({
			redirect_uris: [redirectUri],
		});
		expect(response.data?.client_id).toBeDefined();
		expect(response.data?.client_secret).toBeUndefined();
		expect(response.data?.token_endpoint_auth_method).toBe("none");
		expect(response.data?.public).toBe(true);
	});

	/**
	 * Real-world MCP clients (Claude, Codex, Factory Droid) send
	 * token_endpoint_auth_method: "client_secret_post" in their DCR payload.
	 * The server overrides this to "none" and communicates the actual method
	 * in the registration response so compliant clients can adjust.
	 *
	 * @see https://github.com/better-auth/better-auth/issues/8588
	 */
	it("should override client_secret_post to public for unauthenticated DCR", async () => {
		const response = await unauthenticatedClient.oauth2.register({
			token_endpoint_auth_method: "client_secret_post",
			redirect_uris: [redirectUri],
		});
		expect(response.data?.client_id).toBeDefined();
		expect(response.data?.client_secret).toBeUndefined();
		expect(response.data?.token_endpoint_auth_method).toBe("none");
		expect(response.data?.public).toBe(true);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8588
	 */
	it("should override client_secret_basic to public for unauthenticated DCR", async () => {
		const response = await unauthenticatedClient.oauth2.register({
			token_endpoint_auth_method: "client_secret_basic",
			redirect_uris: [redirectUri],
		});
		expect(response.data?.client_id).toBeDefined();
		expect(response.data?.client_secret).toBeUndefined();
		expect(response.data?.token_endpoint_auth_method).toBe("none");
		expect(response.data?.public).toBe(true);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8588
	 */
	it("should clear type 'web' when overriding confidential to public", async () => {
		const response = await unauthenticatedClient.oauth2.register({
			token_endpoint_auth_method: "client_secret_post",
			type: "web",
			redirect_uris: [redirectUri],
		});
		expect(response.data?.client_id).toBeDefined();
		expect(response.data?.client_secret).toBeUndefined();
		expect(response.data?.token_endpoint_auth_method).toBe("none");
		expect(response.data?.type).toBeUndefined();
	});

	/**
	 * client_credentials requires a secret, which public clients never get.
	 * Reject the combination at registration rather than creating an unusable client.
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
 * Verifies the overridden public client is actually usable end-to-end:
 * DCR with client_secret_post (overridden to "none") -> authorize -> PKCE token exchange.
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

	it("should complete authorize + PKCE token exchange after override from client_secret_post", async () => {
		// 1. Register via unauthenticated DCR with client_secret_post (gets overridden to "none")
		const reg = await unauthenticatedClient.oauth2.register({
			token_endpoint_auth_method: "client_secret_post",
			redirect_uris: [redirectUri],
		});
		expect(reg.data?.client_id).toBeDefined();
		expect(reg.data?.client_secret).toBeUndefined();
		expect(reg.data?.token_endpoint_auth_method).toBe("none");

		const clientId = reg.data!.client_id;

		// 2. Build authorization URL with PKCE (no client secret)
		const codeVerifier = generateRandomString(64);
		const { url: authUrl } = await createAuthorizationURL({
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

		// 5. Exchange code at token endpoint with PKCE (no client_secret)
		const { body: tokenBody, headers: tokenHeaders } =
			await authorizationCodeRequest({
				code,
				codeVerifier,
				redirectURI: redirectUri,
				options: {
					clientId,
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
