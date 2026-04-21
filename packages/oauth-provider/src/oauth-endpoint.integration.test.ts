import { createAuthClient } from "better-auth/client";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { beforeAll, describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthClient } from "./types/oauth";

const authServerBaseUrl = "http://localhost:3000";

/**
 * @see https://github.com/better-auth/better-auth/issues/9250
 */
describe("RFC envelope compliance across OAuth endpoints", async () => {
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt({
				jwt: {
					issuer: authServerBaseUrl,
				},
			}),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
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
		fetchOptions: {
			customFetchImpl,
			headers,
		},
	});

	let oauthClient: OAuthClient | null = null;
	const redirectUri = "http://localhost:5000/api/auth/oauth2/callback/test";

	beforeAll(async () => {
		oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
			},
		});
	});

	type Envelope = { error?: string; error_description?: string };

	async function captureJsonResponse(
		path: string,
		init: Parameters<typeof client.$fetch>[1],
	): Promise<{ status: number; body: Envelope | null }> {
		let status = 0;
		let body: Envelope | null = null;
		await client.$fetch(path, {
			...init,
			onResponse: async (context) => {
				status = context.response.status;
				try {
					body = (await context.response.clone().json()) as Envelope;
				} catch {
					body = null;
				}
			},
		});
		return { status, body };
	}

	async function captureRedirect(path: string) {
		let status = 0;
		let location: string | null = null;
		await client.$fetch(path, {
			method: "GET",
			redirect: "manual",
			onResponse: async (context) => {
				status = context.response.status;
				location = context.response.headers.get("location");
			},
		});
		return { status, location };
	}

	function postForm(path: string, body: Record<string, string>) {
		return captureJsonResponse(path, {
			method: "POST",
			body,
			headers: { "content-type": "application/x-www-form-urlencoded" },
		});
	}

	function postJson(path: string, body: Record<string, unknown>) {
		return captureJsonResponse(path, { method: "POST", body });
	}

	describe("oauth2Token (JSON delivery)", () => {
		it("missing grant_type → invalid_request", async () => {
			const { status, body } = await postForm("/oauth2/token", {});
			expect(status).toBe(400);
			expect(body).toEqual({
				error: "invalid_request",
				error_description: "grant_type is required",
			});
		});

		it("unsupported grant_type → unsupported_grant_type", async () => {
			const { status, body } = await postForm("/oauth2/token", {
				grant_type: "password",
			});
			expect(status).toBe(400);
			expect(body?.error).toBe("unsupported_grant_type");
		});
	});

	describe("oauth2Revoke (JSON delivery)", () => {
		it("unknown token_type_hint is ignored at schema level (RFC 7009 §2.2.1)", async () => {
			const { body } = await postForm("/oauth2/revoke", {
				token: "placeholder",
				token_type_hint: "id_token",
			});
			// The schema used to reject unknown hints with unsupported_token_type.
			// RFC 7009 §2.2.1 says servers MAY ignore the hint; that error code is
			// reserved for the token type itself being unsupported, not the hint.
			expect(body?.error).not.toBe("unsupported_token_type");
		});

		it("missing token → invalid_request with envelope", async () => {
			const { status, body } = await postForm("/oauth2/revoke", {});
			expect(status).toBe(400);
			expect(body).toEqual({
				error: "invalid_request",
				error_description: "token is required",
			});
		});
	});

	describe("registerOAuthClient (JSON delivery)", () => {
		it("missing redirect_uris → invalid_redirect_uri", async () => {
			const { status, body } = await postJson("/oauth2/register", {});
			expect(status).toBe(400);
			expect(body?.error).toBe("invalid_redirect_uri");
		});

		it("unsupported token_endpoint_auth_method → invalid_client_metadata default", async () => {
			const { status, body } = await postJson("/oauth2/register", {
				redirect_uris: [redirectUri],
				token_endpoint_auth_method: "not_a_real_method",
			});
			expect(status).toBe(400);
			expect(body?.error).toBe("invalid_client_metadata");
		});
	});

	describe("oauth2Authorize (redirect delivery)", () => {
		it("unsupported response_type=token → error in fragment (OIDC §5)", async () => {
			if (!oauthClient?.client_id) throw new Error("beforeAll didn't run");
			const state = "opaque-state-abc";
			const qs = new URLSearchParams({
				client_id: oauthClient.client_id,
				redirect_uri: redirectUri,
				response_type: "token",
				state,
			}).toString();
			const { status, location } = await captureRedirect(
				`/oauth2/authorize?${qs}`,
			);
			expect(status).toBeGreaterThanOrEqual(300);
			expect(status).toBeLessThan(400);
			expect(location).toBeTruthy();
			const errorUrl = new URL(location!);
			// Implicit flow: errors MUST be in the fragment, not query.
			expect(location!.startsWith(redirectUri)).toBe(true);
			expect(errorUrl.hash).toBeTruthy();
			const params = new URLSearchParams(errorUrl.hash.slice(1));
			expect(params.get("error")).toBe("unsupported_response_type");
			expect(params.get("error_description")).toBeTruthy();
			expect(params.get("state")).toBe(state);
			expect(params.get("iss")).toBeTruthy();
		});

		it("response_mode=query overrides implicit default", async () => {
			if (!oauthClient?.client_id) throw new Error("beforeAll didn't run");
			const qs = new URLSearchParams({
				client_id: oauthClient.client_id,
				redirect_uri: redirectUri,
				response_type: "token",
				response_mode: "query",
				state: "s",
			}).toString();
			const { location } = await captureRedirect(`/oauth2/authorize?${qs}`);
			expect(location).toBeTruthy();
			const errorUrl = new URL(location!);
			// Explicit response_mode wins over the response_type-derived default.
			expect(errorUrl.hash).toBe("");
			expect(errorUrl.searchParams.get("error")).toBe(
				"unsupported_response_type",
			);
		});

		it("duplicated response_type → invalid_request (RFC 6749 §3.1)", async () => {
			if (!oauthClient?.client_id) throw new Error("beforeAll didn't run");
			const qs = new URLSearchParams([
				["client_id", oauthClient.client_id],
				["redirect_uri", redirectUri],
				["response_type", "code"],
				["response_type", "token"],
				["state", "s"],
			]).toString();
			const { status, location } = await captureRedirect(
				`/oauth2/authorize?${qs}`,
			);
			expect(status).toBeGreaterThanOrEqual(300);
			expect(status).toBeLessThan(400);
			expect(location).toBeTruthy();
			const errorUrl = new URL(location!);
			expect(errorUrl.searchParams.get("error")).toBe("invalid_request");
			expect(errorUrl.searchParams.get("error_description")).toMatch(
				/response_type/,
			);
		});

		it("missing client_id → server error page with invalid_request (no RP to trust)", async () => {
			const qs = new URLSearchParams({
				redirect_uri: redirectUri,
				response_type: "code",
				state: "s",
			}).toString();
			const { status, location } = await captureRedirect(
				`/oauth2/authorize?${qs}`,
			);
			expect(status).toBeGreaterThanOrEqual(300);
			expect(status).toBeLessThan(400);
			expect(location).toBeTruthy();
			// Without a trusted client_id we cannot redirect to the RP: fall back
			// to the server error page.
			expect(location!.startsWith(redirectUri)).toBe(false);
			const errorUrl = new URL(location!);
			expect(errorUrl.searchParams.get("error")).toBe("invalid_request");
			expect(errorUrl.searchParams.get("error_description")).toBeTruthy();
		});

		it("invalid response_type with unregistered redirect_uri → server error page", async () => {
			if (!oauthClient?.client_id) throw new Error("beforeAll didn't run");
			const qs = new URLSearchParams({
				client_id: oauthClient.client_id,
				redirect_uri: "http://evil.example.com/callback",
				response_type: "token",
				state: "s",
			}).toString();
			const { status, location } = await captureRedirect(
				`/oauth2/authorize?${qs}`,
			);
			expect(status).toBeGreaterThanOrEqual(300);
			expect(status).toBeLessThan(400);
			expect(location).toBeTruthy();
			// Open-redirect guard: unregistered redirect_uri means we cannot trust
			// the RP, regardless of other validation failures.
			expect(location!.startsWith("http://evil.example.com")).toBe(false);
		});
	});

	describe("oauth2Introspect (JSON delivery)", () => {
		it("missing token → invalid_request with envelope", async () => {
			const { status, body } = await postForm("/oauth2/introspect", {});
			expect(status).toBe(400);
			expect(body).toEqual({
				error: "invalid_request",
				error_description: "token is required",
			});
		});
	});

	describe("oauth2EndSession (JSON delivery)", () => {
		it("missing id_token_hint → invalid_request with envelope", async () => {
			const { status, body } = await captureJsonResponse(
				"/oauth2/end-session",
				{ method: "GET" },
			);
			expect(status).toBe(400);
			expect(body).toEqual({
				error: "invalid_request",
				error_description: "id_token_hint is required",
			});
		});
	});
});
