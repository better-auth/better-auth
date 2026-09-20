import { classifyHost } from "@better-auth/core/utils/host";
import type { createAuthClient } from "better-auth/client";
import { generateRandomString } from "better-auth/crypto";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";

const authServerBaseURL = "http://localhost:3000";
const lanOrigin = "http://192.168.1.50:8000";
const lanRedirect = `${lanOrigin}/auth/callback`;
const lanLogout = `${lanOrigin}/logout`;
const homelabOrigin = "http://myapp.homelab.lan";
const homelabRedirect = `${homelabOrigin}/auth/callback`;

function allowListedOrigins(url: URL) {
	return url.origin === lanOrigin || url.origin === homelabOrigin;
}

async function authorizeRedirect(input: {
	client: ReturnType<typeof createAuthClient>;
	headers: Headers;
	clientId: string;
	redirectUri: string;
	includePkce?: boolean;
}) {
	const authorizationURL = new URL(
		`${authServerBaseURL}/api/auth/oauth2/authorize`,
	);
	authorizationURL.searchParams.set("client_id", input.clientId);
	authorizationURL.searchParams.set("redirect_uri", input.redirectUri);
	authorizationURL.searchParams.set("response_type", "code");
	authorizationURL.searchParams.set("scope", "openid");
	authorizationURL.searchParams.set("state", "state");
	if (input.includePkce !== false) {
		authorizationURL.searchParams.set(
			"code_challenge",
			generateRandomString(43),
		);
		authorizationURL.searchParams.set("code_challenge_method", "S256");
	}

	let redirectLocation: URL | undefined;
	await input.client.$fetch(authorizationURL.toString(), {
		headers: input.headers,
		redirect: "manual",
		onResponse(context) {
			const location = context.response.headers.get("location");
			if (location) {
				redirectLocation = new URL(location, authServerBaseURL);
			}
		},
	});

	if (!redirectLocation) {
		throw new Error("Expected the authorize endpoint to redirect");
	}
	return redirectLocation;
}

/**
 * @see https://github.com/better-auth/better-auth/issues/11277
 */
describe("allowInsecureRedirectUri", () => {
	it("classifies homelab.lan as public so the callback must be origin-authoritative", () => {
		expect(classifyHost("myapp.homelab.lan").kind).toBe("public");
	});

	describe("default HTTPS-only policy", () => {
		it("rejects LAN http and keeps invalid_request on the authorization server", async () => {
			const { auth, client, signInWithTestUser } = await getTestInstance(
				{
					baseURL: authServerBaseURL,
					plugins: [
						oauthProvider({
							loginPage: "/login",
							consentPage: "/consent",
						}),
						jwt(),
					],
				},
				{
					clientOptions: {
						plugins: [oauthProviderClient()],
					},
				},
			);
			const { headers } = await signInWithTestUser();
			const oauthClient = await auth.api.adminCreateOAuthClient({
				headers,
				body: {
					redirect_uris: ["https://example.com/callback"],
					application_type: "web",
					skip_consent: true,
				},
			});
			const ctx = await auth.$context;
			await ctx.adapter.update({
				model: "oauthClient",
				where: [{ field: "clientId", value: oauthClient.client_id }],
				update: { redirectUris: [lanRedirect] },
			});

			const location = await authorizeRedirect({
				client,
				headers,
				clientId: oauthClient.client_id,
				redirectUri: lanRedirect,
			});

			expect(location.origin).toBe(authServerBaseURL);
			expect(location.pathname).toBe("/api/auth/error");
			expect(location.searchParams.get("error")).toBe("invalid_request");
			expect(location.searchParams.get("error_description")).toContain("HTTPS");
			expect(location.origin).not.toBe(lanOrigin);
		});
	});

	describe("callback opt-in", () => {
		it("allows LAN http when the callback returns true for that origin", async () => {
			const { auth, client, signInWithTestUser } = await getTestInstance(
				{
					baseURL: authServerBaseURL,
					plugins: [
						oauthProvider({
							loginPage: "/login",
							consentPage: "/consent",
							allowInsecureRedirectUri: allowListedOrigins,
						}),
						jwt(),
					],
				},
				{
					clientOptions: {
						plugins: [oauthProviderClient()],
					},
				},
			);
			const { headers } = await signInWithTestUser();
			const oauthClient = await auth.api.adminCreateOAuthClient({
				headers,
				body: {
					redirect_uris: [lanRedirect],
					application_type: "web",
					skip_consent: true,
				},
			});

			const location = await authorizeRedirect({
				client,
				headers,
				clientId: oauthClient.client_id,
				redirectUri: lanRedirect,
			});

			expect(location.origin).toBe(lanOrigin);
			expect(location.pathname).toBe("/auth/callback");
			expect(location.searchParams.get("code")).toBeTypeOf("string");
			expect(location.searchParams.has("error")).toBe(false);
		});

		it("allows homelab.lan by origin even if classified public", async () => {
			const { auth, client, signInWithTestUser } = await getTestInstance(
				{
					baseURL: authServerBaseURL,
					plugins: [
						oauthProvider({
							loginPage: "/login",
							consentPage: "/consent",
							allowInsecureRedirectUri: allowListedOrigins,
						}),
						jwt(),
					],
				},
				{
					clientOptions: {
						plugins: [oauthProviderClient()],
					},
				},
			);
			const { headers } = await signInWithTestUser();
			const oauthClient = await auth.api.adminCreateOAuthClient({
				headers,
				body: {
					redirect_uris: [homelabRedirect],
					application_type: "web",
					skip_consent: true,
				},
			});

			const location = await authorizeRedirect({
				client,
				headers,
				clientId: oauthClient.client_id,
				redirectUri: homelabRedirect,
			});

			expect(location.origin).toBe(homelabOrigin);
			expect(location.searchParams.get("code")).toBeTypeOf("string");
			expect(location.searchParams.has("error")).toBe(false);
		});

		it("honors the same callback at the token endpoint", async () => {
			const { auth, client, signInWithTestUser } = await getTestInstance(
				{
					baseURL: authServerBaseURL,
					plugins: [
						oauthProvider({
							loginPage: "/login",
							consentPage: "/consent",
							allowInsecureRedirectUri: allowListedOrigins,
						}),
						jwt(),
					],
				},
				{
					clientOptions: {
						plugins: [oauthProviderClient()],
					},
				},
			);
			const { headers } = await signInWithTestUser();
			const oauthClient = await auth.api.adminCreateOAuthClient({
				headers,
				body: {
					redirect_uris: [lanRedirect],
					application_type: "web",
					skip_consent: true,
					require_pkce: false,
					token_endpoint_auth_method: "client_secret_post",
					grant_types: ["authorization_code"],
				},
			});

			const location = await authorizeRedirect({
				client,
				headers,
				clientId: oauthClient.client_id,
				redirectUri: lanRedirect,
				includePkce: false,
			});
			const code = location.searchParams.get("code");
			expect(code).toBeTruthy();

			const tokens = await client.$fetch<{ access_token?: string }>(
				"/oauth2/token",
				{
					method: "POST",
					headers: {
						"content-type": "application/x-www-form-urlencoded",
					},
					body: new URLSearchParams({
						grant_type: "authorization_code",
						code: code!,
						redirect_uri: lanRedirect,
						client_id: oauthClient.client_id,
						client_secret: oauthClient.client_secret!,
					}),
				},
			);
			expect(tokens.error).toBeNull();
			expect(tokens.data?.access_token).toBeDefined();
		});

		it("honors the same callback on logout post_logout_redirect_uri", async () => {
			const { auth, customFetchImpl, signInWithTestUser } =
				await getTestInstance({
					baseURL: authServerBaseURL,
					plugins: [
						oauthProvider({
							loginPage: "/login",
							consentPage: "/consent",
							allowInsecureRedirectUri: allowListedOrigins,
						}),
						jwt(),
					],
				});
			const { headers } = await signInWithTestUser();
			await auth.api.adminCreateOAuthClient({
				headers,
				body: {
					redirect_uris: [lanRedirect],
					post_logout_redirect_uris: [lanLogout],
					application_type: "web",
					enable_end_session: true,
				},
			});

			const url = new URL(`${authServerBaseURL}/api/auth/oauth2/end-session`);
			url.searchParams.set("post_logout_redirect_uri", lanLogout);
			const requestHeaders = new Headers(headers);
			requestHeaders.set("accept", "text/html");
			const allowed = await customFetchImpl(url.toString(), {
				method: "GET",
				headers: requestHeaders,
				redirect: "manual",
			});
			expect(allowed.status).toBe(200);

			const deniedAuth = await getTestInstance({
				baseURL: authServerBaseURL,
				plugins: [
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
					}),
					jwt(),
				],
			});
			const deniedHeaders = new Headers(
				(await deniedAuth.signInWithTestUser()).headers,
			);
			deniedHeaders.set("accept", "text/html");
			const denied = await deniedAuth.customFetchImpl(url.toString(), {
				method: "GET",
				headers: deniedHeaders,
				redirect: "manual",
			});
			expect(denied.status).toBe(400);
			const deniedBody = (await denied.json()) as {
				error?: string;
				error_description?: string;
			};
			expect(deniedBody.error).toBe("invalid_request");
			expect(deniedBody.error_description).toContain("HTTPS");
		});

		it("honors the same callback during dynamic client registration", async () => {
			const allowed = await getTestInstance({
				baseURL: authServerBaseURL,
				plugins: [
					jwt(),
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						allowDynamicClientRegistration: true,
						allowUnauthenticatedClientRegistration: true,
						allowInsecureRedirectUri: allowListedOrigins,
					}),
				],
			});
			const allowedResponse = await allowed.customFetchImpl(
				`${authServerBaseURL}/api/auth/oauth2/register`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						application_type: "web",
						redirect_uris: [lanRedirect],
					}),
				},
			);
			expect(allowedResponse.status).toBe(201);

			const denied = await getTestInstance({
				baseURL: authServerBaseURL,
				plugins: [
					jwt(),
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						allowDynamicClientRegistration: true,
						allowUnauthenticatedClientRegistration: true,
					}),
				],
			});
			const deniedResponse = await denied.customFetchImpl(
				`${authServerBaseURL}/api/auth/oauth2/register`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						application_type: "web",
						redirect_uris: [lanRedirect],
					}),
				},
			);
			expect(deniedResponse.status).toBe(400);
			expect(((await deniedResponse.json()) as { error?: string }).error).toBe(
				"invalid_redirect_uri",
			);
		});
	});
});
