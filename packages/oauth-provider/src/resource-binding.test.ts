import { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import { createAuthorizationURL } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { decodeJwt } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthClient } from "./types/oauth";

const authServerBaseUrl = "http://localhost:3000";
const rpBaseUrl = "http://localhost:5000";
const resourceA = "https://api-a.example.com";
const resourceB = "https://api-b.example.com";

function toAudienceValues(audienceClaim: unknown): string[] {
	if (Array.isArray(audienceClaim)) return audienceClaim as string[];
	return audienceClaim == null ? [] : [audienceClaim as string];
}

function tokenForm(params: Record<string, string | undefined>) {
	const body = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined) body.set(key, value);
	}
	return {
		body,
		headers: {
			"content-type": "application/x-www-form-urlencoded",
			accept: "application/json",
		},
	};
}

/**
 * The RFC 8707 `resource` indicator is bound to the authorization grant. When a
 * client declares a resource at `/authorize`, the token and refresh endpoints
 * may narrow the issued token to a subset of those resources but may not widen
 * it to a resource the authorization never covered. Before the fix the requested
 * resource was read from the token request body and checked only against the
 * global `resources` allowlist, so a client could obtain (or change, across
 * refreshes) a token for any allow-listed resource regardless of the grant.
 *
 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-p2fr-6hmx-4528
 */
describe("oauth-provider resource indicator binding", async () => {
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt({ jwt: { issuer: authServerBaseUrl } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				resources: [resourceA, resourceB],
				enforcePerClientResources: false,
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

	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;
	let oauthClient: OAuthClient | null = null;

	beforeAll(async () => {
		oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: { redirect_uris: [redirectUri], skip_consent: true },
		});
		expect(oauthClient?.client_id).toBeDefined();
		expect(oauthClient?.client_secret).toBeDefined();
	});

	/** Drive /authorize with the given resources and return the issued code. */
	async function authorize(resources: string[]) {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw new Error("beforeAll did not run");
		}
		const codeVerifier = generateRandomString(32);
		const { url } = await createAuthorizationURL({
			id: providerId,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
				redirectURI: redirectUri,
			},
			redirectURI: "",
			authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
			state: "rfc8707",
			scopes: ["openid", "offline_access"],
			codeVerifier,
		});
		for (const r of resources) url.searchParams.append("resource", r);

		let callbackRedirectUrl = "";
		await client.$fetch(url.toString(), {
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackRedirectUrl).toContain(redirectUri);
		const code = new URL(callbackRedirectUrl).searchParams.get("code");
		expect(code).toBeTruthy();
		return { code: code!, codeVerifier };
	}

	function exchangeCode(args: {
		code: string;
		codeVerifier: string;
		resources?: string[];
	}) {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw new Error("beforeAll did not run");
		}
		const body = new URLSearchParams();
		body.set("grant_type", "authorization_code");
		body.set("code", args.code);
		body.set("code_verifier", args.codeVerifier);
		body.set("redirect_uri", redirectUri);
		body.set("client_id", oauthClient.client_id);
		body.set("client_secret", oauthClient.client_secret);
		for (const r of args.resources ?? []) body.append("resource", r);
		return client.$fetch<{
			access_token?: string;
			refresh_token?: string;
			[key: string]: unknown;
		}>("/oauth2/token", {
			method: "POST",
			body,
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				accept: "application/json",
			},
		});
	}

	function refresh(refreshToken: string, resources?: string[]) {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw new Error("beforeAll did not run");
		}
		const { body, headers: reqHeaders } = tokenForm({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			client_id: oauthClient.client_id,
			client_secret: oauthClient.client_secret,
			scope: "openid offline_access",
		});
		for (const r of resources ?? []) body.append("resource", r);
		return client.$fetch<{
			access_token?: string;
			refresh_token?: string;
			[key: string]: unknown;
		}>("/oauth2/token", { method: "POST", body, headers: reqHeaders });
	}

	it("rejects a token for a resource the authorization did not cover", async () => {
		const { code, codeVerifier } = await authorize([resourceA]);
		const tokens = await exchangeCode({
			code,
			codeVerifier,
			resources: [resourceB],
		});
		expect(tokens.error?.status).toBeDefined();
		expect(tokens.data?.access_token).toBeUndefined();
	});

	it("narrows the JWT access-token audience to the requested resource subset", async () => {
		const { code, codeVerifier } = await authorize([resourceA, resourceB]);
		const tokens = await exchangeCode({
			code,
			codeVerifier,
			resources: [resourceA],
		});
		expect(tokens.error).toBeNull();
		const audienceValues = toAudienceValues(
			decodeJwt(tokens.data!.access_token!).aud,
		);
		expect(audienceValues).toContain(resourceA);
		expect(audienceValues).not.toContain(resourceB);
	});

	it("inherits the authorized resource when the token request omits it", async () => {
		const { code, codeVerifier } = await authorize([resourceA]);
		const tokens = await exchangeCode({ code, codeVerifier });
		expect(tokens.error).toBeNull();
		const audienceValues = toAudienceValues(
			decodeJwt(tokens.data!.access_token!).aud,
		);
		expect(audienceValues).toContain(resourceA);
	});

	it("keeps the full authorized set on the refresh token across narrowing", async () => {
		const { code, codeVerifier } = await authorize([resourceA, resourceB]);
		const initial = await exchangeCode({
			code,
			codeVerifier,
			resources: [resourceA],
		});
		expect(initial.data?.refresh_token).toBeDefined();

		// Refresh without a resource: the refresh token retained [A, B] (RFC 8707 §2.2).
		const refreshed = await refresh(initial.data!.refresh_token!);
		expect(refreshed.error).toBeNull();
		const audienceValues = toAudienceValues(
			decodeJwt(refreshed.data!.access_token!).aud,
		);
		expect(audienceValues).toContain(resourceA);
		expect(audienceValues).toContain(resourceB);
	});

	it("rejects a refresh that widens beyond the authorized resources", async () => {
		const { code, codeVerifier } = await authorize([resourceA]);
		const initial = await exchangeCode({
			code,
			codeVerifier,
			resources: [resourceA],
		});
		expect(initial.data?.refresh_token).toBeDefined();

		const refreshed = await refresh(initial.data!.refresh_token!, [resourceB]);
		expect(refreshed.error?.status).toBeDefined();
	});
});
