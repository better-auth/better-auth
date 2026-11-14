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

	it("applies the policy and the origin rule to clients from createOAuthClient", async () => {
		const policy = vi.fn(() => true);
		const provider = await createProvider({
			clientRegistrationEnableEndSession: policy,
		});
		const client = await provider.auth.api.createOAuthClient({
			headers: provider.headers,
			body: {
				redirect_uris: [redirectUri],
				post_logout_redirect_uris: [logoutRedirectUri],
			},
		});
		expect(client.enable_end_session).toBe(true);
		expect(policy).toHaveBeenCalledWith(
			expect.objectContaining({ registrationSource: "createOAuthClient" }),
		);

		await expect(
			provider.auth.api.createOAuthClient({
				headers: provider.headers,
				body: {
					redirect_uris: [redirectUri],
					post_logout_redirect_uris: ["https://attacker.example/landing"],
				},
			}),
		).rejects.toMatchObject({
			body: { error: "invalid_client_metadata" },
		});
	});

	it("keeps an owner's updates from adding a post-logout URI outside the redirect origins", async () => {
		const provider = await createProvider({
			clientRegistrationEnableEndSession: true,
		});
		const client = await provider.auth.api.createOAuthClient({
			headers: provider.headers,
			body: {
				redirect_uris: [redirectUri],
				post_logout_redirect_uris: [logoutRedirectUri],
			},
		});

		await expect(
			provider.auth.api.updateOAuthClient({
				headers: provider.headers,
				body: {
					client_id: client.client_id,
					update: {
						post_logout_redirect_uris: [
							logoutRedirectUri,
							"https://attacker.example/landing",
						],
					},
				},
			}),
		).rejects.toMatchObject({
			body: { error: "invalid_client_metadata" },
		});

		const moved = await provider.auth.api.updateOAuthClient({
			headers: provider.headers,
			body: {
				client_id: client.client_id,
				update: {
					redirect_uris: ["https://new-rp.example.com/callback"],
					post_logout_redirect_uris: [
						logoutRedirectUri,
						"https://new-rp.example.com/logged-out",
					],
				},
			},
		});
		expect(moved.post_logout_redirect_uris).toEqual([
			logoutRedirectUri,
			"https://new-rp.example.com/logged-out",
		]);
	});

	it("keeps post-logout URIs an administrator set when the owner updates the client", async () => {
		const provider = await createProvider();
		const client = await provider.auth.api.adminCreateOAuthClient({
			headers: provider.headers,
			body: {
				redirect_uris: [redirectUri],
				post_logout_redirect_uris: ["https://elsewhere.example/landing"],
				enable_end_session: true,
			},
		});
		const updated = await provider.auth.api.updateOAuthClient({
			headers: provider.headers,
			body: {
				client_id: client.client_id,
				update: {
					redirect_uris: ["https://rp2.example.com/callback"],
					post_logout_redirect_uris: ["https://elsewhere.example/landing"],
				},
			},
		});
		expect(updated.redirect_uris).toEqual(["https://rp2.example.com/callback"]);
	});

	it("lets an administrator take back logout from a client without an owner", async () => {
		const provider = await createProvider({
			clientRegistrationEnableEndSession: true,
		});
		const registration = await provider.registerOpenClient({
			post_logout_redirect_uris: [logoutRedirectUri],
		});
		const client = await registration.json();
		expect(client.enable_end_session).toBe(true);

		const revoked = await provider.auth.api.adminUpdateOAuthClient({
			headers: provider.headers,
			body: {
				client_id: client.client_id,
				update: { enable_end_session: false },
			},
		});
		expect(revoked.enable_end_session).toBeFalsy();
		const response = await provider.endSession({
			client_id: client.client_id,
			post_logout_redirect_uri: logoutRedirectUri,
		});
		expect(response.status).toBe(401);

		// Other fields of a client the caller does not own stay off limits.
		await expect(
			provider.auth.api.adminUpdateOAuthClient({
				headers: provider.headers,
				body: {
					client_id: client.client_id,
					update: { enable_end_session: true, client_name: "Renamed" },
				},
			}),
		).rejects.toMatchObject({ statusCode: 401 });
	});
});
