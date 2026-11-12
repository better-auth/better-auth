import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it, vi } from "vitest";
import { oauthProvider } from "./oauth";
import type { OAuthOptions, Scope } from "./types";

const baseUrl = "http://localhost:3000";
const rpOrigin = "https://rp.example.com";
const redirectUri = `${rpOrigin}/callback`;
const logoutRedirectUri = `${rpOrigin}/logged-out`;
const endSessionEndpoint = `${baseUrl}/api/auth/oauth2/end-session`;

async function createProvider(
	options: Pick<
		OAuthOptions<Scope[]>,
		"clientRegistrationEnableEndSession"
	> = {},
) {
	const instance = await getTestInstance({
		baseURL: baseUrl,
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				allowDynamicClientRegistration: true,
				allowUnauthenticatedClientRegistration: true,
				...options,
			}),
		],
	});
	const { headers } = await instance.signInWithTestUser();
	headers.set("origin", baseUrl);

	async function registerOpenClient(body: Record<string, unknown>) {
		return instance.customFetchImpl(`${baseUrl}/api/auth/oauth2/register`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				redirect_uris: [redirectUri],
				token_endpoint_auth_method: "none",
				...body,
			}),
		});
	}

	async function endSession(query: Record<string, string>) {
		const url = new URL(endSessionEndpoint);
		for (const [key, value] of Object.entries(query)) {
			url.searchParams.set(key, value);
		}
		const requestHeaders = new Headers(headers);
		requestHeaders.set("accept", "text/html");
		return instance.customFetchImpl(url.toString(), {
			headers: requestHeaders,
			redirect: "manual",
		});
	}

	async function confirmEndSession(confirmation: Response) {
		instance.cookieSetter(headers)({ response: confirmation } as never);
		const requestHeaders = new Headers(headers);
		requestHeaders.set("accept", "text/html");
		requestHeaders.set("content-type", "application/x-www-form-urlencoded");
		return instance.customFetchImpl(`${endSessionEndpoint}/confirm`, {
			method: "POST",
			headers: requestHeaders,
			body: new URLSearchParams({ action: "confirm" }),
			redirect: "manual",
		});
	}

	return {
		...instance,
		headers,
		registerOpenClient,
		endSession,
		confirmEndSession,
	};
}

describe("RP-initiated logout for registered clients", () => {
	it("keeps refusing logout for dynamically registered clients by default", async () => {
		const provider = await createProvider();
		const registration = await provider.registerOpenClient({
			post_logout_redirect_uris: [logoutRedirectUri],
			enable_end_session: true,
		});
		expect(registration.status).toBe(201);
		const client = await registration.json();
		expect(client.enable_end_session).toBeUndefined();

		const response = await provider.endSession({
			client_id: client.client_id,
			post_logout_redirect_uri: logoutRedirectUri,
		});
		expect(response.status).toBe(401);
		expect(await response.text()).toContain(
			"The client is not allowed to initiate logout",
		);
	});

	it("lets dynamically registered clients log out and return to a post-logout URI", async () => {
		const provider = await createProvider({
			clientRegistrationEnableEndSession: true,
		});
		const registration = await provider.registerOpenClient({
			post_logout_redirect_uris: [logoutRedirectUri],
		});
		expect(registration.status).toBe(201);
		const client = await registration.json();
		expect(client.enable_end_session).toBe(true);

		const confirmation = await provider.endSession({
			client_id: client.client_id,
			post_logout_redirect_uri: logoutRedirectUri,
			state: "after-logout",
		});
		expect(confirmation.status).toBe(200);
		expect(await confirmation.text()).toContain(
			"data-oidc-logout-confirmation",
		);

		const completed = await provider.confirmEndSession(confirmation);
		expect(completed.status).toBe(302);
		expect(completed.headers.get("location")).toBe(
			`${logoutRedirectUri}?state=after-logout`,
		);
		expect(
			await provider.auth.api.getSession({ headers: provider.headers }),
		).toBeNull();
	});

	it("rejects post-logout URIs on an origin none of the redirect URIs use", async () => {
		const provider = await createProvider({
			clientRegistrationEnableEndSession: true,
		});
		const registration = await provider.registerOpenClient({
			post_logout_redirect_uris: [
				logoutRedirectUri,
				"https://attacker.example/landing",
			],
		});
		expect(registration.status).toBe(400);
		expect(await registration.json()).toMatchObject({
			error: "invalid_client_metadata",
		});
	});

	it("matches native private-use and loopback post-logout URIs to the redirect URIs", async () => {
		const provider = await createProvider({
			clientRegistrationEnableEndSession: true,
		});
		const registration = await provider.registerOpenClient({
			application_type: "native",
			redirect_uris: [
				"com.example.app:/callback",
				"http://127.0.0.1/callback",
				"http://localhost/callback",
			],
			post_logout_redirect_uris: [
				"com.example.app:/logged-out",
				"http://127.0.0.1:8123/logged-out",
				"http://localhost:8123/logged-out",
			],
		});
		expect(registration.status).toBe(201);
		expect((await registration.json()).enable_end_session).toBe(true);

		const otherApp = await provider.registerOpenClient({
			application_type: "native",
			redirect_uris: ["com.example.app:/callback"],
			post_logout_redirect_uris: ["com.attacker.app:/logged-out"],
		});
		expect(otherApp.status).toBe(400);
	});

	it("asks the policy callback with the validated client and its registration source", async () => {
		const policy = vi.fn(
			({ client }: { client: { client_name?: string } }) =>
				client.client_name === "Trusted",
		);
		const provider = await createProvider({
			clientRegistrationEnableEndSession: policy,
		});
		const trusted = await provider.registerOpenClient({
			client_name: "Trusted",
			post_logout_redirect_uris: [logoutRedirectUri],
		});
		expect((await trusted.json()).enable_end_session).toBe(true);
		expect(policy).toHaveBeenCalledWith(
			expect.objectContaining({
				registrationSource: "dynamic",
				client: expect.objectContaining({
					client_id: expect.any(String),
					client_name: "Trusted",
					redirect_uris: [redirectUri],
					post_logout_redirect_uris: [logoutRedirectUri],
				}),
			}),
		);

		// A client the policy declines registers without logout, and the origin
		// rule does not apply to it.
		const other = await provider.registerOpenClient({
			client_name: "Other",
			post_logout_redirect_uris: ["https://elsewhere.example/landing"],
		});
		expect(other.status).toBe(201);
		expect((await other.json()).enable_end_session).toBeUndefined();
	});

	it("leaves admin-created clients to the admin's choice", async () => {
		const provider = await createProvider({
			clientRegistrationEnableEndSession: true,
		});
		const client = await provider.auth.api.adminCreateOAuthClient({
			headers: provider.headers,
			body: {
				redirect_uris: [redirectUri],
				post_logout_redirect_uris: ["https://elsewhere.example/landing"],
			},
		});
		expect(client.enable_end_session).toBeUndefined();
	});
});
