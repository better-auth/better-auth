import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { decodeJwt } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthClient } from "./types/oauth";
import { resolvedSubjectClaim } from "./utils";

const authServerBaseUrl = "http://localhost:3000";
const rpBaseUrl = "http://localhost:5000";
const rpBaseUrl2 = "http://localhost:6000";
const validAudience = "https://myapi.example.com";

/**
 * Drives a full authorization_code exchange for the given client and returns
 * the token response. Mirrors the helper in `pairwise.test.ts`.
 */
async function getTokensForClient(
	deps: {
		client: ReturnType<typeof createAuthClient>;
		headers: Headers;
	},
	oauthClient: OAuthClient,
	redirectUri: string,
	overrides?: { resource?: string },
) {
	const { client, headers } = deps;
	const codeVerifier = generateRandomString(32);
	const url = await createAuthorizationURL({
		id: "test",
		options: {
			clientId: oauthClient.client_id,
			clientSecret: oauthClient.client_secret!,
			redirectURI: redirectUri,
		},
		redirectURI: "",
		authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
		state: "test-state",
		scopes: ["openid", "profile", "email", "offline_access"],
		codeVerifier,
	});

	let callbackRedirectUrl = "";
	await client.$fetch(url.toString(), {
		headers,
		onError(context) {
			callbackRedirectUrl = context.response.headers.get("Location") || "";
		},
	});
	const callbackUrl = new URL(callbackRedirectUrl);
	const code = callbackUrl.searchParams.get("code")!;

	const { body, headers: reqHeaders } = await authorizationCodeRequest({
		code,
		codeVerifier,
		redirectURI: redirectUri,
		options: {
			clientId: oauthClient.client_id,
			clientSecret: oauthClient.client_secret!,
			redirectURI: redirectUri,
		},
		resource: overrides?.resource,
	});

	return client.$fetch<{
		access_token?: string;
		id_token?: string;
		refresh_token?: string;
		expires_in?: number;
		token_type?: string;
		scope?: string;
	}>("/oauth2/token", {
		method: "POST",
		body,
		headers: reqHeaders,
	});
}

describe("custom subject (getSubject)", async () => {
	// Mutated between flows to simulate different active workspaces for the
	// same human (e.g. a workspace switcher updating the session).
	let currentReferenceId: string | undefined;

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt({ jwt: { issuer: authServerBaseUrl } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				validAudiences: [validAudience],
				allowDynamicClientRegistration: true,
				postLogin: {
					page: "/post-login",
					shouldRedirect: async () => false,
					consentReferenceId: async () => currentReferenceId,
				},
				// Base subject = `mem-<referenceId>` when a reference is present,
				// otherwise the raw user.id.
				getSubject: ({ userId, referenceId }) =>
					referenceId ? `mem-${referenceId}` : userId,
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
		],
	});

	const { headers, user } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: authServerBaseUrl,
		fetchOptions: { customFetchImpl, headers },
	});
	const deps = { client, headers };

	let oauthClient: OAuthClient | null;
	const redirectUri = `${rpBaseUrl}/api/auth/callback/test`;

	beforeAll(async () => {
		oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				scope: "openid profile email offline_access",
				skip_consent: true,
			},
		});
		expect(oauthClient?.client_id).toBeDefined();
	});

	it("applies getSubject to the id token sub", async () => {
		currentReferenceId = "AAA";
		const tokens = await getTokensForClient(deps, oauthClient!, redirectUri);
		const idToken = decodeJwt(tokens.data!.id_token!);
		expect(idToken.sub).toBe("mem-AAA");
	});

	it("keeps sub consistent across id_token, /userinfo and /introspect (opaque)", async () => {
		currentReferenceId = "AAA";
		const tokens = await getTokensForClient(deps, oauthClient!, redirectUri);
		const idToken = decodeJwt(tokens.data!.id_token!);

		const userinfo = await client.$fetch<{ sub?: string; email?: string }>(
			"/oauth2/userinfo",
			{
				method: "GET",
				headers: { authorization: `Bearer ${tokens.data!.access_token}` },
			},
		);

		const introspection = await client.oauth2.introspect(
			{
				client_id: oauthClient!.client_id,
				client_secret: oauthClient!.client_secret,
				token: tokens.data!.access_token!,
				token_type_hint: "access_token",
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);

		expect(idToken.sub).toBe("mem-AAA");
		expect(userinfo.data?.sub).toBe("mem-AAA");
		expect(introspection.data?.sub).toBe("mem-AAA");
	});

	it("keeps sub consistent across surfaces for a JWT access token", async () => {
		// `resource` forces a JWT access token, which has no DB record — the
		// crux path that must recover referenceId from an embedded claim.
		currentReferenceId = "AAA";
		const tokens = await getTokensForClient(deps, oauthClient!, redirectUri, {
			resource: validAudience,
		});
		const idToken = decodeJwt(tokens.data!.id_token!);

		const userinfo = await client.$fetch<{ sub?: string }>("/oauth2/userinfo", {
			method: "GET",
			headers: { authorization: `Bearer ${tokens.data!.access_token}` },
		});

		const introspection = await client.oauth2.introspect(
			{
				client_id: oauthClient!.client_id,
				client_secret: oauthClient!.client_secret,
				token: tokens.data!.access_token!,
				token_type_hint: "access_token",
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);

		expect(idToken.sub).toBe("mem-AAA");
		expect(userinfo.data?.sub).toBe("mem-AAA");
		expect(introspection.data?.sub).toBe("mem-AAA");
	});

	it("produces a different sub per workspace for the same user", async () => {
		currentReferenceId = "AAA";
		const tokensA = await getTokensForClient(deps, oauthClient!, redirectUri);
		currentReferenceId = "BBB";
		const tokensB = await getTokensForClient(deps, oauthClient!, redirectUri);

		const subA = decodeJwt(tokensA.data!.id_token!).sub;
		const subB = decodeJwt(tokensB.data!.id_token!).sub;

		expect(subA).toBe("mem-AAA");
		expect(subB).toBe("mem-BBB");
		expect(subA).not.toBe(subB);
	});

	it("leaves the access token internal sub as the raw user.id", async () => {
		// JWT access token so we can decode and inspect its sub directly.
		currentReferenceId = "AAA";
		const tokens = await getTokensForClient(deps, oauthClient!, redirectUri, {
			resource: validAudience,
		});

		const accessToken = decodeJwt(tokens.data!.access_token!);
		const idToken = decodeJwt(tokens.data!.id_token!);

		// Internal sub is the real user.id (the /userinfo lookup key)...
		expect(accessToken.sub).toBe(user.id);
		// ...and differs from the presented (workspace) subject.
		expect(accessToken.sub).not.toBe(idToken.sub);

		// Proof the raw sub still resolves the user: /userinfo returns claims.
		const userinfo = await client.$fetch<{ sub?: string; email?: string }>(
			"/oauth2/userinfo",
			{
				method: "GET",
				headers: { authorization: `Bearer ${tokens.data!.access_token}` },
			},
		);
		expect(userinfo.data?.email).toBe(user.email);
		expect(userinfo.data?.sub).toBe("mem-AAA");
	});

	it("never exposes the raw reference or the internal claim", async () => {
		currentReferenceId = "AAA";

		// Opaque access token: referenceId lives only on the DB record.
		const opaque = await getTokensForClient(deps, oauthClient!, redirectUri);
		const opaqueIntrospection = await client.oauth2.introspect(
			{
				client_id: oauthClient!.client_id,
				client_secret: oauthClient!.client_secret,
				token: opaque.data!.access_token!,
				token_type_hint: "access_token",
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(opaqueIntrospection.data?.sub).toBe("mem-AAA");
		expect(opaqueIntrospection.data).not.toHaveProperty("reference_id");
		expect(opaqueIntrospection.data).not.toHaveProperty(resolvedSubjectClaim);

		// JWT access token: carries the resolved subject (not the raw reference)
		// as an internal claim, which is stripped from the introspection response.
		const jwtTokens = await getTokensForClient(
			deps,
			oauthClient!,
			redirectUri,
			{
				resource: validAudience,
			},
		);
		const accessToken = decodeJwt(jwtTokens.data!.access_token!);
		expect(accessToken).not.toHaveProperty("reference_id");
		expect(accessToken[resolvedSubjectClaim]).toBe("mem-AAA");

		const jwtIntrospection = await client.oauth2.introspect(
			{
				client_id: oauthClient!.client_id,
				client_secret: oauthClient!.client_secret,
				token: jwtTokens.data!.access_token!,
				token_type_hint: "access_token",
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(jwtIntrospection.data?.sub).toBe("mem-AAA");
		expect(jwtIntrospection.data).not.toHaveProperty("reference_id");
		expect(jwtIntrospection.data).not.toHaveProperty(resolvedSubjectClaim);
	});

	it("preserves the workspace sub through a token refresh", async () => {
		currentReferenceId = "AAA";
		const tokens = await getTokensForClient(deps, oauthClient!, redirectUri);
		const originalSub = decodeJwt(tokens.data!.id_token!).sub;

		// A workspace switch elsewhere must not retroactively change a token
		// already minted against workspace AAA.
		currentReferenceId = "BBB";
		const refreshBody = new URLSearchParams({
			grant_type: "refresh_token",
			client_id: oauthClient!.client_id,
			client_secret: oauthClient!.client_secret!,
			refresh_token: tokens.data!.refresh_token!,
		});
		const refreshed = await client.$fetch<{ id_token?: string }>(
			"/oauth2/token",
			{
				method: "POST",
				body: refreshBody,
				headers: { "content-type": "application/x-www-form-urlencoded" },
			},
		);

		expect(refreshed.data?.id_token).toBeDefined();
		const refreshedSub = decodeJwt(refreshed.data!.id_token!).sub;
		expect(refreshedSub).toBe("mem-AAA");
		expect(refreshedSub).toBe(originalSub);
	});

	it("re-embeds the workspace sub on a refreshed JWT access token", async () => {
		// referenceId lives on the refresh-token row, so the freshly minted JWT
		// access token must re-embed it for /userinfo to keep resolving it.
		currentReferenceId = "AAA";
		const tokens = await getTokensForClient(deps, oauthClient!, redirectUri, {
			resource: validAudience,
		});

		currentReferenceId = "BBB";
		const refreshBody = new URLSearchParams({
			grant_type: "refresh_token",
			client_id: oauthClient!.client_id,
			client_secret: oauthClient!.client_secret!,
			refresh_token: tokens.data!.refresh_token!,
			resource: validAudience,
		});
		const refreshed = await client.$fetch<{
			access_token?: string;
			id_token?: string;
		}>("/oauth2/token", {
			method: "POST",
			body: refreshBody,
			headers: { "content-type": "application/x-www-form-urlencoded" },
		});

		const accessToken = decodeJwt(refreshed.data!.access_token!);
		expect(accessToken.sub).toBe(user.id);
		expect(accessToken[resolvedSubjectClaim]).toBe("mem-AAA");

		const userinfo = await client.$fetch<{ sub?: string }>("/oauth2/userinfo", {
			method: "GET",
			headers: { authorization: `Bearer ${refreshed.data!.access_token}` },
		});
		expect(userinfo.data?.sub).toBe("mem-AAA");
	});
});

describe("custom subject composes with pairwise", async () => {
	let currentReferenceId: string | undefined;

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt({ jwt: { issuer: authServerBaseUrl } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				pairwiseSecret: "test-pairwise-secret-key-32chars!!",
				validAudiences: [validAudience],
				allowDynamicClientRegistration: true,
				postLogin: {
					page: "/post-login",
					shouldRedirect: async () => false,
					consentReferenceId: async () => currentReferenceId,
				},
				// Returns the *base* subject; pairwise hashing applies on top.
				getSubject: ({ userId, referenceId }) => referenceId ?? userId,
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
		],
	});

	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: authServerBaseUrl,
		fetchOptions: { customFetchImpl, headers },
	});
	const deps = { client, headers };

	let pairwiseClientA: OAuthClient | null;
	let pairwiseClientB: OAuthClient | null;
	const redirectUriA = `${rpBaseUrl}/api/auth/callback/test-a`;
	const redirectUriB = `${rpBaseUrl2}/api/auth/callback/test-b`;

	beforeAll(async () => {
		pairwiseClientA = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUriA],
				scope: "openid profile email offline_access",
				skip_consent: true,
				subject_type: "pairwise",
			},
		});
		pairwiseClientB = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUriB],
				scope: "openid profile email offline_access",
				skip_consent: true,
				subject_type: "pairwise",
			},
		});
		expect(pairwiseClientA?.client_id).toBeDefined();
		expect(pairwiseClientB?.client_id).toBeDefined();
	});

	it("hashes the getSubject base, not the raw user.id", async () => {
		currentReferenceId = "WS-1";
		const tokens = await getTokensForClient(
			deps,
			pairwiseClientA!,
			redirectUriA,
		);
		const sub = decodeJwt(tokens.data!.id_token!).sub as string;

		// Pairwise output is opaque and differs from both the raw reference and
		// the raw user.id.
		expect(sub).toBeDefined();
		expect(sub).not.toBe("WS-1");
		expect(sub).not.toBe(currentReferenceId);
	});

	it("yields different subs per workspace base (base feeds the hash)", async () => {
		currentReferenceId = "WS-1";
		const tokens1 = await getTokensForClient(
			deps,
			pairwiseClientA!,
			redirectUriA,
		);
		currentReferenceId = "WS-2";
		const tokens2 = await getTokensForClient(
			deps,
			pairwiseClientA!,
			redirectUriA,
		);

		const sub1 = decodeJwt(tokens1.data!.id_token!).sub;
		const sub2 = decodeJwt(tokens2.data!.id_token!).sub;
		expect(sub1).not.toBe(sub2);
	});

	it("keeps the pairwise sub consistent for a JWT access token without leaking the base", async () => {
		currentReferenceId = "WS-1";
		const tokens = await getTokensForClient(
			deps,
			pairwiseClientA!,
			redirectUriA,
			{
				resource: validAudience,
			},
		);
		const pairwiseSub = decodeJwt(tokens.data!.id_token!).sub as string;
		const accessToken = decodeJwt(tokens.data!.access_token!);

		// The embedded claim carries the per-RP pairwise sub — never the raw base
		// reference — so colluding pairwise clients cannot correlate on it.
		expect(accessToken[resolvedSubjectClaim]).toBe(pairwiseSub);
		expect(accessToken[resolvedSubjectClaim]).not.toBe("WS-1");
		expect(accessToken.sub).not.toBe(pairwiseSub);
		expect(accessToken).not.toHaveProperty("reference_id");

		const userinfo = await client.$fetch<{ sub?: string }>("/oauth2/userinfo", {
			method: "GET",
			headers: { authorization: `Bearer ${tokens.data!.access_token}` },
		});
		const introspection = await client.oauth2.introspect(
			{
				client_id: pairwiseClientA!.client_id,
				client_secret: pairwiseClientA!.client_secret,
				token: tokens.data!.access_token!,
				token_type_hint: "access_token",
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);
		expect(userinfo.data?.sub).toBe(pairwiseSub);
		expect(introspection.data?.sub).toBe(pairwiseSub);
		expect(introspection.data).not.toHaveProperty(resolvedSubjectClaim);
	});

	it("yields different subs per client (per-RP isolation preserved)", async () => {
		currentReferenceId = "WS-1";
		const tokensA = await getTokensForClient(
			deps,
			pairwiseClientA!,
			redirectUriA,
		);
		const tokensB = await getTokensForClient(
			deps,
			pairwiseClientB!,
			redirectUriB,
		);

		const subA = decodeJwt(tokensA.data!.id_token!).sub;
		const subB = decodeJwt(tokensB.data!.id_token!).sub;
		expect(subA).not.toBe(subB);
	});

	it("warns once when a pairwise client is issued a JWT access token", async () => {
		// A fresh client keeps the per-process deduplication state clean regardless
		// of which other tests already minted JWT access tokens.
		const warnRedirectUri = `${rpBaseUrl}/api/auth/callback/warn`;
		const warnClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [warnRedirectUri],
				scope: "openid profile email offline_access",
				skip_consent: true,
				subject_type: "pairwise",
			},
		});
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			currentReferenceId = "WS-1";

			// Opaque access token mints no JWT, so it never warns.
			await getTokensForClient(deps, warnClient!, warnRedirectUri);
			expect(
				warnSpy.mock.calls.filter((call) =>
					String(call[0]).includes(warnClient!.client_id),
				),
			).toHaveLength(0);

			// First JWT access token warns; the second is suppressed as a duplicate.
			await getTokensForClient(deps, warnClient!, warnRedirectUri, {
				resource: validAudience,
			});
			await getTokensForClient(deps, warnClient!, warnRedirectUri, {
				resource: validAudience,
			});
			expect(
				warnSpy.mock.calls.filter((call) =>
					String(call[0]).includes(warnClient!.client_id),
				),
			).toHaveLength(1);
		} finally {
			warnSpy.mockRestore();
		}
	});
});

describe("pairwise JWT access token warning is silenceable", async () => {
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt({ jwt: { issuer: authServerBaseUrl } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				pairwiseSecret: "test-pairwise-secret-key-32chars!!",
				validAudiences: [validAudience],
				allowDynamicClientRegistration: true,
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
					pairwiseJwtAccessToken: true,
				},
			}),
		],
	});

	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: authServerBaseUrl,
		fetchOptions: { customFetchImpl, headers },
	});
	const deps = { client, headers };

	let pairwiseClient: OAuthClient | null;
	const redirectUri = `${rpBaseUrl}/api/auth/callback/silenced`;

	beforeAll(async () => {
		pairwiseClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				scope: "openid profile email offline_access",
				skip_consent: true,
				subject_type: "pairwise",
			},
		});
		expect(pairwiseClient?.client_id).toBeDefined();
	});

	it("does not warn when silenceWarnings.pairwiseJwtAccessToken is set", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			await getTokensForClient(deps, pairwiseClient!, redirectUri, {
				resource: validAudience,
			});
			expect(
				warnSpy.mock.calls.filter((call) =>
					String(call[0]).includes(pairwiseClient!.client_id),
				),
			).toHaveLength(0);
		} finally {
			warnSpy.mockRestore();
		}
	});
});

describe("default subject (no getSubject)", async () => {
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt({ jwt: { issuer: authServerBaseUrl } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				pairwiseSecret: "test-pairwise-secret-key-32chars!!",
				allowDynamicClientRegistration: true,
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
		],
	});

	const { headers, user } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: authServerBaseUrl,
		fetchOptions: { customFetchImpl, headers },
	});
	const deps = { client, headers };

	let regularClient: OAuthClient | null;
	let pairwiseClient: OAuthClient | null;
	const redirectUriRegular = `${rpBaseUrl}/api/auth/callback/regular`;
	const redirectUriPairwise = `${rpBaseUrl2}/api/auth/callback/pairwise`;

	beforeAll(async () => {
		regularClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUriRegular],
				scope: "openid profile email offline_access",
				skip_consent: true,
			},
		});
		pairwiseClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUriPairwise],
				scope: "openid profile email offline_access",
				skip_consent: true,
				subject_type: "pairwise",
			},
		});
		expect(regularClient?.client_id).toBeDefined();
		expect(pairwiseClient?.client_id).toBeDefined();
	});

	it("uses the raw user.id as sub when no hook is configured", async () => {
		const tokens = await getTokensForClient(
			deps,
			regularClient!,
			redirectUriRegular,
		);
		const idToken = decodeJwt(tokens.data!.id_token!);
		expect(idToken.sub).toBe(user.id);
	});

	it("still applies pairwise when no hook is configured", async () => {
		const tokens = await getTokensForClient(
			deps,
			pairwiseClient!,
			redirectUriPairwise,
		);
		const idToken = decodeJwt(tokens.data!.id_token!);
		expect(idToken.sub).toBeDefined();
		expect(idToken.sub).not.toBe(user.id);
	});
});
