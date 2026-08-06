import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { decodeJwt } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthClient } from "./types/oauth";
import { resolvedSubjectClaim } from "./utils";

const authServerBaseUrl = "http://localhost:3000";
const rpBaseUrl = "http://localhost:5000";
const rpBaseUrl2 = "http://localhost:6000";
const validResource = "https://myapi.example.com";

const introspectHeaders = {
	accept: "application/json",
	"content-type": "application/x-www-form-urlencoded",
};

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
				resources: [validResource],
				enforcePerClientResources: false,
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
				application_type: "native",
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
			{ headers: introspectHeaders },
		);

		expect(idToken.sub).toBe("mem-AAA");
		expect(userinfo.data?.sub).toBe("mem-AAA");
		expect(introspection.data?.sub).toBe("mem-AAA");
	});

	it("keeps sub consistent across surfaces for a JWT access token", async () => {
		// `resource` forces a JWT access token, which has no DB record — the
		// crux path that must recover the subject from the carrier claim.
		currentReferenceId = "AAA";
		const tokens = await getTokensForClient(deps, oauthClient!, redirectUri, {
			resource: validResource,
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
			{ headers: introspectHeaders },
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
			resource: validResource,
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
			{ headers: introspectHeaders },
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
			{ resource: validResource },
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
			{ headers: introspectHeaders },
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

	/**
	 * Introspecting the refresh token itself must report the grant's workspace
	 * subject. The refresh-token row is the only place its `referenceId`
	 * survives, so a recompute that ignored it would answer with the raw user
	 * id for a grant that was issued for a workspace.
	 */
	it("reports the workspace sub when introspecting a refresh token", async () => {
		currentReferenceId = "AAA";
		const tokens = await getTokensForClient(deps, oauthClient!, redirectUri);

		// A workspace switch after issuance must not change the answer.
		currentReferenceId = "BBB";
		const introspection = await client.oauth2.introspect(
			{
				client_id: oauthClient!.client_id,
				client_secret: oauthClient!.client_secret,
				token: tokens.data!.refresh_token!,
				token_type_hint: "refresh_token",
			},
			{ headers: introspectHeaders },
		);

		expect(introspection.data?.active).toBe(true);
		expect(introspection.data?.sub).toBe("mem-AAA");
		expect(introspection.data).not.toHaveProperty(resolvedSubjectClaim);
	});

	it("re-embeds the workspace sub on a refreshed JWT access token", async () => {
		// referenceId lives on the refresh-token row, so the freshly minted JWT
		// access token must re-embed it for /userinfo to keep resolving it.
		currentReferenceId = "AAA";
		const tokens = await getTokensForClient(deps, oauthClient!, redirectUri, {
			resource: validResource,
		});

		currentReferenceId = "BBB";
		const refreshBody = new URLSearchParams({
			grant_type: "refresh_token",
			client_id: oauthClient!.client_id,
			client_secret: oauthClient!.client_secret!,
			refresh_token: tokens.data!.refresh_token!,
			resource: validResource,
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

describe("custom subject skips client_credentials", async () => {
	const machineScope = "m2m:read";

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt({ jwt: { issuer: authServerBaseUrl } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				scopes: [machineScope],
				resources: [validResource],
				enforcePerClientResources: false,
				clientPrivileges: ({ action }) =>
					action === "create" ||
					action === "configure-client-credentials-scopes",
				allowDynamicClientRegistration: true,
				postLogin: {
					page: "/post-login",
					shouldRedirect: async () => false,
					consentReferenceId: async () => "AAA",
				},
				getSubject: ({ userId, referenceId }) =>
					referenceId ? `mem-${referenceId}` : userId,
			}),
		],
	});

	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: authServerBaseUrl,
		fetchOptions: { customFetchImpl, headers },
	});

	let machineClient: OAuthClient | null;

	beforeAll(async () => {
		machineClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				grant_types: ["client_credentials"],
				redirect_uris: [`${rpBaseUrl}/api/auth/callback/machine`],
				application_type: "native",
				skip_consent: true,
				client_credentials_scopes: [machineScope],
			},
		});
		expect(machineClient?.client_id).toBeDefined();
	});

	it("leaves client_credentials tokens untouched (no user to resolve)", async () => {
		// client_credentials has no user, so getSubject must never fire: no
		// presentation sub is computed and the carrier is never emitted.
		// `resource` forces a JWT access token we can decode and inspect.
		const tokens = await client.oauth2.token(
			{
				grant_type: "client_credentials",
				client_id: machineClient!.client_id,
				client_secret: machineClient!.client_secret,
				scope: machineScope,
				resource: validResource,
			},
			{ headers: { "content-type": "application/x-www-form-urlencoded" } },
		);

		expect(tokens.error).toBeNull();
		const accessToken = decodeJwt(tokens.data!.access_token!);
		// RFC 9068 §2.2: with no resource owner the client is the subject.
		expect(accessToken.sub).toBe(machineClient!.client_id);
		expect(accessToken.sub).not.toBe("mem-AAA");
		expect(accessToken).not.toHaveProperty(resolvedSubjectClaim);
	});
});

/**
 * The carrier claim is AS-owned. A claim contributor that returns the reserved
 * name must not be able to choose the subject presented at /userinfo or
 * /introspect, and the carrier must never reach a response body.
 *
 * The hook here deliberately resolves to the raw `user.id`. That is the shape
 * that used to be exploitable: when the resolved subject equalled `sub` the AS
 * emitted no carrier of its own, so a planted one was the only carrier on the
 * token and the presentation layer read it as the subject.
 */
describe("custom subject carrier is not forgeable", async () => {
	let userInfoHookJwt: Record<string, unknown> | undefined;

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt({ jwt: { issuer: authServerBaseUrl } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				resources: [validResource],
				enforcePerClientResources: false,
				allowDynamicClientRegistration: true,
				postLogin: {
					page: "/post-login",
					shouldRedirect: async () => false,
					consentReferenceId: async () => "AAA",
				},
				getSubject: ({ userId }) => userId,
				customAccessTokenClaims: () => ({
					[resolvedSubjectClaim]: "forged-by-access-token-claims",
				}),
				customUserInfoClaims: ({ jwt: tokenPayload }) => {
					userInfoHookJwt = tokenPayload as Record<string, unknown>;
					return { [resolvedSubjectClaim]: "forged-by-userinfo-claims" };
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
	const redirectUri = `${rpBaseUrl}/api/auth/callback/forge`;

	beforeAll(async () => {
		oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				application_type: "native",
				scope: "openid profile email offline_access",
				skip_consent: true,
			},
		});
		expect(oauthClient?.client_id).toBeDefined();
	});

	it("ignores a carrier planted by customAccessTokenClaims on a JWT access token", async () => {
		const tokens = await getTokensForClient(deps, oauthClient!, redirectUri, {
			resource: validResource,
		});
		const accessToken = decodeJwt(tokens.data!.access_token!);
		expect(accessToken[resolvedSubjectClaim]).toBe(user.id);

		const userinfo = await client.$fetch<{ sub?: string }>("/oauth2/userinfo", {
			method: "GET",
			headers: { authorization: `Bearer ${tokens.data!.access_token}` },
		});
		expect(userinfo.data?.sub).toBe(user.id);
	});

	it("ignores a carrier planted by customAccessTokenClaims on an opaque token", async () => {
		// The opaque path re-derives the same claim set at introspection, so the
		// planted name gets a second chance to land there.
		const tokens = await getTokensForClient(deps, oauthClient!, redirectUri);
		const introspection = await client.oauth2.introspect(
			{
				client_id: oauthClient!.client_id,
				client_secret: oauthClient!.client_secret,
				token: tokens.data!.access_token!,
				token_type_hint: "access_token",
			},
			{ headers: introspectHeaders },
		);
		expect(introspection.data?.sub).toBe(user.id);
		expect(introspection.data).not.toHaveProperty(resolvedSubjectClaim);
	});

	it("hides the carrier from customUserInfoClaims and drops it from the body", async () => {
		const tokens = await getTokensForClient(deps, oauthClient!, redirectUri, {
			resource: validResource,
		});
		const userinfo = await client.$fetch<Record<string, unknown>>(
			"/oauth2/userinfo",
			{
				method: "GET",
				headers: { authorization: `Bearer ${tokens.data!.access_token}` },
			},
		);

		expect(userInfoHookJwt).toBeDefined();
		expect(userInfoHookJwt).not.toHaveProperty(resolvedSubjectClaim);
		expect(userinfo.data).not.toHaveProperty(resolvedSubjectClaim);
		expect(userinfo.data?.sub).toBe(user.id);
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
				resources: [validResource],
				enforcePerClientResources: false,
				allowDynamicClientRegistration: true,
				postLogin: {
					page: "/post-login",
					shouldRedirect: async () => false,
					consentReferenceId: async () => currentReferenceId,
				},
				// Returns the *base* subject; pairwise hashing applies on top.
				getSubject: ({ userId, referenceId }) => referenceId ?? userId,
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
				application_type: "native",
				scope: "openid profile email offline_access",
				skip_consent: true,
				subject_type: "pairwise",
			},
		});
		pairwiseClientB = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUriB],
				application_type: "native",
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

	it("embeds the per-RP pairwise sub, not the base reference, for a JWT access token", async () => {
		currentReferenceId = "WS-1";
		const tokens = await getTokensForClient(
			deps,
			pairwiseClientA!,
			redirectUriA,
			{ resource: validResource },
		);
		const pairwiseSub = decodeJwt(tokens.data!.id_token!).sub as string;
		const accessToken = decodeJwt(tokens.data!.access_token!);

		// The carrier holds the per-RP pairwise sub — never the raw base
		// reference — so pairwise subject isolation is preserved.
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
			{ headers: introspectHeaders },
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
});

describe("custom subject rejects an empty result", async () => {
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt({ jwt: { issuer: authServerBaseUrl } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				resources: [validResource],
				enforcePerClientResources: false,
				allowDynamicClientRegistration: true,
				getSubject: () => "   ",
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

	let oauthClient: OAuthClient | null;
	const redirectUri = `${rpBaseUrl}/api/auth/callback/blank`;

	beforeAll(async () => {
		oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				application_type: "native",
				scope: "openid profile email offline_access",
				skip_consent: true,
			},
		});
		expect(oauthClient?.client_id).toBeDefined();
	});

	it("fails the token request instead of presenting two identities", async () => {
		// A blank subject would put `sub: ""` in the id token while `/userinfo`
		// fell back to the raw user id.
		const tokens = await getTokensForClient(deps, oauthClient!, redirectUri);
		expect(tokens.data?.id_token).toBeUndefined();
		expect(tokens.error).toBeTruthy();
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
				resources: [validResource],
				enforcePerClientResources: false,
				allowDynamicClientRegistration: true,
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
				application_type: "native",
				scope: "openid profile email offline_access",
				skip_consent: true,
			},
		});
		pairwiseClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUriPairwise],
				application_type: "native",
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

	it("emits no carrier claim when no hook is configured", async () => {
		// Default deployments must get byte-for-byte the tokens they got before.
		const tokens = await getTokensForClient(
			deps,
			regularClient!,
			redirectUriRegular,
			{ resource: validResource },
		);
		const accessToken = decodeJwt(tokens.data!.access_token!);
		expect(accessToken).not.toHaveProperty(resolvedSubjectClaim);
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
