import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import { generateCodeChallenge } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { BetterAuthPlugin } from "better-auth/types";
import { beforeAll, describe, expect, it } from "vitest";
import { oauthProvider } from "./oauth";
import { getOAuthProviderApi } from "./token";
import type { StoredAuthorizationQuery } from "./types";
import type { OAuthClient } from "./types/oauth";

/**
 * `issueAuthorizationCode` repeats the checks `/oauth2/authorize` runs before
 * it approves a request. Each case runs one request through both, with
 * `prompt=none` on the authorization endpoint, and expects the same outcome:
 * a code from both, or the same OIDC Core §3.1.2.6 error from both.
 *
 * @see https://openid.net/specs/openid-connect-core-1_0.html#AuthError
 */
describe("issueAuthorizationCode matches /oauth2/authorize with prompt=none", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const redirectUri = "https://client.example.com/callback";

	const issuer = {
		id: "test-code-issuer",
		endpoints: {
			testIssueCode: createAuthEndpoint(
				"/test/issue-code",
				{ method: "POST", use: [sessionMiddleware] },
				async (ctx) => {
					const provider = getOAuthProviderApi(
						ctx,
						ctx.context.getPlugin("oauth-provider")!.options,
					);
					const issued = await provider.issueAuthorizationCode({
						query: ctx.body as StoredAuthorizationQuery,
						session: ctx.context.session,
					});
					return ctx.json({ code: issued.code });
				},
			),
		},
	} satisfies BetterAuthPlugin;

	// The hooks key off a client-added parameter, so each case picks the step
	// that asks for interaction.
	const hookCase = (query: URLSearchParams) => query.get("parity_case");
	const mfaAcr = "urn:example:acr:mfa";
	const { auth, client, signInWithTestUser } = await getTestInstance({
		baseURL: `${authServerBaseUrl}/api/auth/`,
		advanced: { skipTrailingSlashes: true },
		plugins: [
			issuer,
			jwt({ jwt: { issuer: authServerBaseUrl } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				signup: {
					page: "/sign-up",
					shouldRedirect: ({ query }) => hookCase(query) === "signup",
				},
				// The session meets the essential acr only in the "mfa" case.
				authenticationContext: {
					acrValuesSupported: ["0", mfaAcr],
					resolve: ({ headers }) => ({
						acr: headers.get("x-parity-acr") === mfaAcr ? mfaAcr : "0",
					}),
				},
				postLogin: {
					page: "/post-login",
					consentReferenceId: () => undefined,
					shouldRedirect: ({ query }) => hookCase(query) === "post-login",
				},
			}),
		],
	});
	const { headers, user } = await signInWithTestUser();

	let skipConsentClient: OAuthClient;
	let consentClient: OAuthClient;

	beforeAll(async () => {
		const createClient = (body: Record<string, unknown>) =>
			auth.api.adminCreateOAuthClient({
				headers,
				body: {
					token_endpoint_auth_method: "client_secret_post",
					grant_types: ["authorization_code"],
					redirect_uris: [redirectUri],
					...body,
				},
			});
		[skipConsentClient, consentClient] = await Promise.all([
			createClient({ skip_consent: true }),
			createClient({}),
		]);
		const { adapter } = await auth.$context;
		const now = new Date();
		await adapter.create({
			model: "oauthConsent",
			data: {
				clientId: consentClient.client_id,
				userId: user.id,
				scopes: ["openid"],
				createdAt: now,
				updatedAt: now,
			},
		});
	});

	async function request(
		oauthClient: OAuthClient,
		extra: Record<string, string>,
	): Promise<Record<string, string>> {
		return {
			response_type: "code",
			client_id: oauthClient.client_id,
			redirect_uri: redirectUri,
			scope: "openid",
			state: generateRandomString(16),
			code_challenge: await generateCodeChallenge(generateRandomString(43)),
			code_challenge_method: "S256",
			...extra,
		};
	}

	/** The `code` or `error` `/oauth2/authorize` redirects back with. */
	async function authorizeOutcome(
		query: Record<string, string>,
		requestHeaders: Headers,
	) {
		let location = "";
		await client.$fetch(
			`/oauth2/authorize?${new URLSearchParams({ ...query, prompt: "none" })}`,
			{
				headers: requestHeaders,
				onError(ctx) {
					location = ctx.response.headers.get("location") ?? "";
				},
			},
		);
		const params = new URL(location).searchParams;
		return params.get("code") ? "code" : params.get("error");
	}

	/** The client calls the issuing endpoint directly, so it authenticates. */
	async function issueOutcome(
		oauthClient: OAuthClient,
		query: Record<string, string>,
		requestHeaders: Headers,
	) {
		const issued = await client.$fetch<{ code: string }>("/test/issue-code", {
			method: "POST",
			headers: requestHeaders,
			body: { ...query, client_secret: oauthClient.client_secret },
		});
		if (issued.data?.code) return "code";
		return (issued.error as { error?: string } | null)?.error ?? null;
	}

	const essentialMfa = JSON.stringify({
		id_token: { acr: { essential: true, values: [mfaAcr] } },
	});
	const cases: {
		name: string;
		client: () => OAuthClient;
		extra: Record<string, string>;
		acr?: string;
		expected: string;
	}[] = [
		{
			name: "a client that skips consent",
			client: () => skipConsentClient,
			extra: {},
			expected: "code",
		},
		{
			name: "stored consent that covers the scopes",
			client: () => consentClient,
			extra: {},
			expected: "code",
		},
		{
			name: "stored consent that misses a scope",
			client: () => consentClient,
			extra: { scope: "openid profile" },
			expected: "consent_required",
		},
		{
			name: "max_age=0",
			client: () => skipConsentClient,
			extra: { max_age: "0" },
			expected: "login_required",
		},
		{
			name: "a satisfied max_age",
			client: () => skipConsentClient,
			extra: { max_age: "3600" },
			expected: "code",
		},
		{
			name: "an essential acr the session cannot meet",
			client: () => skipConsentClient,
			extra: { claims: essentialMfa },
			expected: "access_denied",
		},
		{
			name: "an essential acr the session meets",
			client: () => skipConsentClient,
			extra: { claims: essentialMfa },
			acr: mfaAcr,
			expected: "code",
		},
		{
			name: "a signup step",
			client: () => skipConsentClient,
			extra: { parity_case: "signup" },
			expected: "interaction_required",
		},
		{
			name: "a post-login step",
			client: () => skipConsentClient,
			extra: { parity_case: "post-login" },
			expected: "interaction_required",
		},
	];

	it.each(cases)(
		"$name: $expected",
		async ({ client, extra, acr, expected }) => {
			const requestHeaders = new Headers(headers);
			if (acr) requestHeaders.set("x-parity-acr", acr);
			const oauthClient = client();
			const query = await request(oauthClient, extra);
			expect(await authorizeOutcome(query, requestHeaders)).toBe(expected);
			expect(await issueOutcome(oauthClient, query, requestHeaders)).toBe(
				expected,
			);
		},
	);
});
