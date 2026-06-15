import { clientCredentialsTokenRequest } from "@better-auth/core/oauth2";
import { createAuthClient } from "better-auth/client";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { beforeAll, describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthClient } from "./types/oauth";

describe("oauth credential responses carry no-store", async () => {
	const baseURL = "http://localhost:3000";
	const rpBaseUrl = "http://localhost:5000";
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL,
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				allowDynamicClientRegistration: true,
				silenceWarnings: { oauthAuthServerConfig: true, openidConfig: true },
			}),
		],
	});
	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL,
		fetchOptions: { customFetchImpl, headers },
	});

	const redirectUri = `${rpBaseUrl}/api/auth/callback/test`;
	let oauthClient: OAuthClient | null = null;

	beforeAll(async () => {
		oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				grant_types: ["client_credentials"],
				redirect_uris: [redirectUri],
				skip_consent: true,
			},
		});
		expect(oauthClient?.client_secret).toBeDefined();
	});

	// RFC 6749 §5.1: the token response carries live credentials.
	it("sets no-store on a successful token response", async () => {
		const { body, headers: reqHeaders } = await clientCredentialsTokenRequest({
			options: {
				clientId: oauthClient!.client_id!,
				clientSecret: oauthClient!.client_secret!,
				redirectURI: redirectUri,
			},
		});
		let response: Response | undefined;
		const tokens = await client.$fetch<{ access_token?: string }>(
			"/oauth2/token",
			{
				method: "POST",
				body,
				headers: reqHeaders,
				onResponse(context) {
					response = context.response;
				},
			},
		);
		expect(tokens.data?.access_token).toBeDefined();
		expect(response?.headers.get("Cache-Control")).toBe("no-store");
		expect(response?.headers.get("Pragma")).toBe("no-cache");
	});

	// The flag applies to thrown errors too: an unknown client reaches the
	// handler, which rejects it, and the error response is still no-store.
	it("sets no-store on a token error response", async () => {
		const { body, headers: reqHeaders } = await clientCredentialsTokenRequest({
			options: {
				clientId: "client-that-does-not-exist",
				clientSecret: "wrong",
				redirectURI: redirectUri,
			},
		});
		let response: Response | undefined;
		await client.$fetch("/oauth2/token", {
			method: "POST",
			body,
			headers: reqHeaders,
			onResponse(context) {
				response = context.response;
			},
		});
		expect(response?.status).toBeGreaterThanOrEqual(400);
		expect(response?.headers.get("Cache-Control")).toBe("no-store");
		expect(response?.headers.get("Pragma")).toBe("no-cache");
	});

	// RFC 7591 §3.2.1: registration returns 201 and a client_secret to protect.
	it("sets 201 and no-store on a registration response", async () => {
		let response: Response | undefined;
		const result = await client.$fetch<OAuthClient>("/oauth2/register", {
			method: "POST",
			body: { redirect_uris: [redirectUri] },
			onResponse(context) {
				response = context.response;
			},
		});
		expect(result.data?.client_id).toBeDefined();
		expect(response?.status).toBe(201);
		expect(response?.headers.get("Cache-Control")).toBe("no-store");
		expect(response?.headers.get("Pragma")).toBe("no-cache");
	});

	// Introspection exposes token metadata; Better Auth marks it no-store.
	it("sets no-store on the introspection response", async () => {
		const { body, headers: reqHeaders } = await clientCredentialsTokenRequest({
			options: {
				clientId: oauthClient!.client_id!,
				clientSecret: oauthClient!.client_secret!,
				redirectURI: redirectUri,
			},
		});
		const tokens = await client.$fetch<{ access_token?: string }>(
			"/oauth2/token",
			{ method: "POST", body, headers: reqHeaders },
		);
		let response: Response | undefined;
		await client.oauth2.introspect(
			{
				client_id: oauthClient!.client_id,
				client_secret: oauthClient!.client_secret,
				token: tokens.data?.access_token ?? "",
			},
			{
				headers: {
					accept: "application/json",
					"content-type": "application/x-www-form-urlencoded",
				},
				onResponse(context) {
					response = context.response;
				},
			},
		);
		expect(response?.headers.get("Cache-Control")).toBe("no-store");
		expect(response?.headers.get("Pragma")).toBe("no-cache");
	});
});
