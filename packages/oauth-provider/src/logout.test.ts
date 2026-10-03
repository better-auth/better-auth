import {
	authorizationCodeRequest,
	createAuthorizationURL,
} from "@better-auth/core/oauth2";
import { createAuthClient } from "better-auth/client";
import {
	applySetCookies,
	parseCookies,
	parseSetCookieHeader,
} from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { toNodeHandler } from "better-auth/node";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { decodeJwt, UnsecuredJWT } from "jose";
import type { Listener } from "listhen";
import { listen } from "listhen";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthClient } from "./types/oauth";

type MakeRequired<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

describe("oauth logout", async () => {
	const port = 3004;
	const baseUrl = `http://localhost:${port}`;
	const rpBaseUrl = "http://localhost:5000";
	const state = "123";
	const scopes = ["openid", "email", "profile", "offline_access"];

	const { auth, signInWithTestUser, customFetchImpl, cookieSetter } =
		await getTestInstance({
			baseURL: baseUrl,
			advanced: {
				disableOriginCheck: false,
			},
			plugins: [
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					allowDynamicClientRegistration: true,
					scopes,
				}),
				jwt(),
			],
		});
	let { headers } = await signInWithTestUser();
	headers.set("origin", baseUrl);
	const client = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: baseUrl,
		fetchOptions: {
			customFetchImpl,
		},
	});
	let oauthClient: OAuthClient | null;
	let server: Listener;

	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/callback/${providerId}`;
	const logoutRedirectUri = `${rpBaseUrl}/api/auth/callback/logout`;
	const endSessionEndpoint = `${baseUrl}/api/auth/oauth2/end-session`;
	const confirmationEndpoint = `${endSessionEndpoint}/confirm`;

	async function requestEndSession(input: {
		method?: "GET" | "POST";
		query?: Record<string, string>;
		body?: Record<string, string>;
		accept?: string;
		includeSessionCookie?: boolean;
		origin?: string;
	}) {
		const method = input.method ?? "GET";
		const url = new URL(endSessionEndpoint);
		for (const [key, value] of Object.entries(input.query ?? {})) {
			url.searchParams.set(key, value);
		}
		const requestHeaders = new Headers(headers);
		if (input.includeSessionCookie === false) {
			requestHeaders.delete("cookie");
		}
		requestHeaders.set("accept", input.accept ?? "text/html");
		let body: URLSearchParams | undefined;
		if (input.body) {
			body = new URLSearchParams(input.body);
			requestHeaders.set("content-type", "application/x-www-form-urlencoded");
			requestHeaders.set("origin", input.origin ?? baseUrl);
		}
		const response = await customFetchImpl(url.toString(), {
			method,
			headers: requestHeaders,
			body,
			redirect: "manual",
		});
		return { response, body: await response.text() };
	}

	async function requestConfirmation(input: {
		body?: Record<string, string>;
		accept?: string;
		origin?: string;
	}) {
		const requestHeaders = new Headers(headers);
		requestHeaders.set("accept", input.accept ?? "text/html");
		requestHeaders.set("content-type", "application/x-www-form-urlencoded");
		requestHeaders.set("origin", input.origin ?? baseUrl);
		const response = await customFetchImpl(confirmationEndpoint, {
			method: "POST",
			headers: requestHeaders,
			body: new URLSearchParams(input.body ?? { action: "confirm" }),
			redirect: "manual",
		});
		return { response, body: await response.text() };
	}

	function captureResponseCookies(response: Response) {
		cookieSetter(headers)({ response } as never);
	}

	function getConfirmationCookie(response: Response) {
		const setCookies = parseSetCookieHeader(
			response.headers.get("set-cookie") ?? "",
		);
		const entry = Array.from(setCookies.entries()).find(([name]) =>
			name.endsWith(".oauth_logout_confirmation"),
		);
		if (!entry) throw new Error("confirmation cookie was not set");
		return { name: entry[0], value: entry[1].value };
	}

	function replaceCookie(target: Headers, name: string, value: string) {
		const cookies = parseCookies(target.get("cookie") ?? "");
		cookies.set(name, value);
		target.set(
			"cookie",
			Array.from(
				cookies,
				([cookieName, cookieValue]) =>
					`${cookieName}=${encodeURIComponent(cookieValue)}`,
			).join("; "),
		);
	}

	async function completeBrowserConfirmation(input: {
		query?: Record<string, string>;
	}) {
		const confirmation = await requestEndSession({
			query: input.query,
			accept: "text/html",
		});
		captureResponseCookies(confirmation.response);
		expect(confirmation.response.status).toBe(200);
		expect(confirmation.response.headers.get("cache-control")).toBe("no-store");
		expect(confirmation.response.headers.get("content-security-policy")).toBe(
			"default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
		);
		expect(confirmation.body).toContain("Confirm logout");
		const completed = await requestConfirmation({
			accept: "text/html",
		});
		return { confirmation, completed };
	}

	// Registers a confidential client application to work with
	beforeAll(async () => {
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				application_type: "native",
				token_endpoint_auth_method: "client_secret_post",
				skip_consent: true,
				enable_end_session: true,
			},
		});
		expect(response?.client_id).toBeDefined();
		expect(response?.user_id).toBeDefined();
		expect(response?.client_secret).toBeDefined();
		expect(response?.redirect_uris).toEqual([redirectUri]);
		expect(response?.enable_end_session).toEqual(true);
		oauthClient = response;

		server = await listen(toNodeHandler(auth.handler), {
			port,
		});
	});

	afterAll(async () => {
		if (server) {
			await server.close();
		}
	});

	// Login again after each test
	beforeEach(async () => {
		const { headers: _headers } = await signInWithTestUser();
		_headers.set("origin", baseUrl);
		headers = _headers;
	});

	async function createAuthUrl(
		overrides?: Partial<Parameters<typeof createAuthorizationURL>[0]>,
	) {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}
		const codeVerifier = generateRandomString(32);
		const url = await createAuthorizationURL({
			id: providerId,
			options: {
				clientId: oauthClient?.client_id,
				clientSecret: oauthClient?.client_secret,
				redirectURI: redirectUri,
				...overrides?.options,
			},
			redirectURI: "",
			authorizationEndpoint: `${baseUrl}/api/auth/oauth2/authorize`,
			state,
			scopes: ["openid", "profile", "email", "offline_access"],
			codeVerifier,
			...overrides,
		});
		return {
			url,
			codeVerifier,
		};
	}

	async function validateAuthCode(
		overrides: MakeRequired<
			Partial<Parameters<typeof authorizationCodeRequest>[0]>,
			"code"
		>,
	) {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const { body, headers } = await authorizationCodeRequest({
			...overrides,
			redirectURI: redirectUri,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
				redirectURI: redirectUri,
				...overrides.options,
			},
		});

		const tokens = await client.$fetch<{
			access_token?: string;
			id_token?: string;
			refresh_token?: string;
			expires_in?: number;
			expires_at?: number;
			token_type?: string;
			scope?: string;
			[key: string]: unknown;
		}>("/oauth2/token", {
			method: "POST",
			body: body,
			headers: headers,
		});

		return tokens;
	}

	async function issueTokens(
		input: { client?: OAuthClient; headers?: Headers; scopes?: string[] } = {},
	) {
		const registeredClient = input.client ?? oauthClient;
		if (!registeredClient?.client_id || !registeredClient.client_secret) {
			throw Error("beforeAll not run properly");
		}
		const codeVerifier = generateRandomString(32);
		const authUrl = await createAuthorizationURL({
			id: providerId,
			options: {
				clientId: registeredClient.client_id,
				clientSecret: registeredClient.client_secret,
				redirectURI: redirectUri,
			},
			redirectURI: "",
			authorizationEndpoint: `${baseUrl}/api/auth/oauth2/authorize`,
			state,
			scopes: input.scopes ?? scopes,
			codeVerifier,
		});

		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			headers: input.headers ?? headers,
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		const callback = new URL(callbackRedirectUrl);
		return validateAuthCode({
			code: callback.searchParams.get("code")!,
			codeVerifier,
			options: {
				clientId: registeredClient.client_id,
				clientSecret: registeredClient.client_secret,
			},
		});
	}

	async function createLogoutRedirectClient() {
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				application_type: "native",
				token_endpoint_auth_method: "client_secret_post",
				enable_end_session: true,
				skip_consent: true,
				post_logout_redirect_uris: [logoutRedirectUri],
			},
		});
		if (!response?.client_id || !response.client_secret) {
			throw Error("logout redirect client registration failed");
		}
		return response;
	}

	it("should fail with invalid id_token_hint", async () => {
		const logoutRes = await client.oauth2.endSession({
			query: {
				id_token_hint: "",
			},
		});
		expect(logoutRes.error?.status).toBeGreaterThanOrEqual(400);
		expect(logoutRes.error?.status).toBeLessThan(500);
	});

	/**
	 * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html#RPLogout
	 */
	it("requires confirmation before deleting the session without a hint", async () => {
		const before = await auth.api.getSession({ headers });
		expect(before).not.toBeNull();

		const { confirmation, completed } = await completeBrowserConfirmation({});
		expect(confirmation.body).toContain(
			'<form method="post" data-oidc-logout-confirmation',
		);
		expect(confirmation.body).toContain('name="action" value="confirm"');
		expect(completed.response.status).toBe(200);
		expect(completed.response.headers.get("cache-control")).toBe("no-store");
		expect(completed.response.headers.get("content-security-policy")).toBe(
			"default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
		);
		expect(completed.body).toContain('data-oidc-logout-state="logged-out"');
		expect(completed.body).toContain("Logged out");
		expect(completed.response.headers.get("location")).toBeNull();

		const after = await auth.api.getSession({ headers });
		expect(after).toBeNull();
	});

	/**
	 * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html#RPLogout
	 */
	it("does not delete on an initial no-hint POST", async () => {
		const result = await requestEndSession({
			method: "POST",
			body: {},
			accept: "text/html",
		});
		expect(result.response.status).toBe(200);
		expect(result.body).toContain("data-oidc-logout-confirmation");
		expect(await auth.api.getSession({ headers })).not.toBeNull();
	});

	/**
	 * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html#RPLogout
	 */
	it("confirms a no-hint form POST when the initial navigation omits the session cookie", async () => {
		const sessionHeaders = new Headers(headers);
		const initial = await requestEndSession({
			method: "POST",
			body: {},
			accept: "text/html",
			includeSessionCookie: false,
			origin: "https://rp.example",
		});
		expect(initial.response.status).toBe(200);
		expect(initial.body).toContain(
			'<form method="post" data-oidc-logout-confirmation',
		);
		expect(initial.body).not.toContain('data-oidc-logout-state="logged-out"');
		expect(
			await auth.api.getSession({ headers: sessionHeaders }),
		).not.toBeNull();

		captureResponseCookies(initial.response);
		const completed = await requestConfirmation({ accept: "text/html" });
		expect(completed.response.status).toBe(200);
		expect(completed.body).toContain('data-oidc-logout-state="logged-out"');
		expect(await auth.api.getSession({ headers: sessionHeaders })).toBeNull();
	});

	/**
	 * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html#RPLogout
	 */
	it("does not delete when the confirmation state is missing or tampered", async () => {
		const confirmation = await requestEndSession({ accept: "text/html" });
		expect(confirmation.body).toContain("data-oidc-logout-confirmation");
		const missingState = await requestConfirmation({ accept: "text/html" });
		expect(missingState.response.status).toBeGreaterThanOrEqual(400);
		expect(missingState.response.headers.get("cache-control")).toBe("no-store");
		expect(missingState.response.headers.get("content-security-policy")).toBe(
			"default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
		);
		expect(await auth.api.getSession({ headers })).not.toBeNull();

		captureResponseCookies(confirmation.response);
		const confirmationCookie = getConfirmationCookie(confirmation.response);
		replaceCookie(headers, confirmationCookie.name, "tampered");
		const tamperedState = await requestConfirmation({ accept: "text/html" });
		expect(tamperedState.response.status).toBeGreaterThanOrEqual(400);
		expect(tamperedState.response.headers.get("cache-control")).toBe(
			"no-store",
		);
		expect(await auth.api.getSession({ headers })).not.toBeNull();
	});

	/**
	 * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html#RPLogout
	 */
	it("rejects confirmation state bound to a different current session", async () => {
		const confirmation = await requestEndSession({ accept: "text/html" });
		captureResponseCookies(confirmation.response);
		const confirmationCookie = getConfirmationCookie(confirmation.response);
		const otherSession = await signInWithTestUser();
		const originalHeaders = headers;
		applySetCookies(otherSession.headers, [
			`${confirmationCookie.name}=${encodeURIComponent(confirmationCookie.value)}; Path=/`,
		]);
		headers = otherSession.headers;
		try {
			const result = await requestConfirmation({ accept: "text/html" });
			expect(result.response.status).toBeGreaterThanOrEqual(400);
			expect(
				await auth.api.getSession({ headers: originalHeaders }),
			).not.toBeNull();
			expect(
				await auth.api.getSession({ headers: otherSession.headers }),
			).not.toBeNull();
		} finally {
			headers = originalHeaders;
		}
	});

	/**
	 * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html#RPLogout
	 */
	it("rejects a cross-origin confirmation POST", async () => {
		const confirmation = await requestEndSession({ accept: "text/html" });
		captureResponseCookies(confirmation.response);
		const result = await requestConfirmation({
			accept: "text/html",
			origin: "https://attacker.example",
		});
		expect(result.response.status).toBe(403);
		expect(await auth.api.getSession({ headers })).not.toBeNull();
	});

	/**
	 * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html#Redirection
	 */
	it("does not redirect or delete for a redirect request without a hint", async () => {
		const result = await requestEndSession({
			query: { post_logout_redirect_uri: logoutRedirectUri },
			accept: "text/html",
		});
		expect(result.response.status).toBe(200);
		expect(result.response.headers.get("location")).toBeNull();
		expect(result.body).toContain("data-oidc-logout-confirmation");
		expect(await auth.api.getSession({ headers })).not.toBeNull();
	});

	/**
	 * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html#RPLogout
	 */
	it("redirects after confirming a no-hint request for an identified client", async () => {
		const redirectClient = await createLogoutRedirectClient();
		const confirmation = await requestEndSession({
			query: {
				client_id: redirectClient.client_id,
				post_logout_redirect_uri: logoutRedirectUri,
				state: "confirmed-state",
			},
			accept: "text/html",
		});
		captureResponseCookies(confirmation.response);
		expect(confirmation.response.status).toBe(200);
		expect(confirmation.response.headers.get("location")).toBeNull();
		expect(confirmation.body).toContain("data-oidc-logout-confirmation");

		const completed = await requestConfirmation({ accept: "text/html" });
		expect(completed.response.status).toBe(302);
		expect(completed.response.headers.get("location")).toBe(
			`${logoutRedirectUri}?state=confirmed-state`,
		);
		expect(await auth.api.getSession({ headers })).toBeNull();
	});

	/**
	 * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html#Redirection
	 */
	it("revalidates a no-hint redirect before completing confirmation", async () => {
		const redirectClient = await createLogoutRedirectClient();
		const confirmation = await requestEndSession({
			query: {
				client_id: redirectClient.client_id,
				post_logout_redirect_uri: logoutRedirectUri,
				state: "stale-registration-state",
			},
			accept: "text/html",
		});
		captureResponseCookies(confirmation.response);
		expect(confirmation.response.status).toBe(200);
		expect(confirmation.response.headers.get("location")).toBeNull();

		const context = await auth.$context;
		await context.adapter.update({
			model: "oauthClient",
			where: [{ field: "clientId", value: redirectClient.client_id }],
			update: { postLogoutRedirectUris: [] },
		});

		const completed = await requestConfirmation({ accept: "text/html" });
		expect(completed.response.status).toBe(200);
		expect(completed.response.headers.get("location")).toBeNull();
		expect(completed.body).toContain('data-oidc-logout-state="logged-out"');
		expect(completed.body).toContain(
			"The requested post-logout redirect was not registered.",
		);
		expect(completed.body).not.toContain("stale-registration-state");
		expect(await auth.api.getSession({ headers })).toBeNull();
	});

	/**
	 * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html#RPLogout
	 */
	it("requires confirmation for a state-only request", async () => {
		const result = await requestEndSession({
			query: { state: "opaque-state" },
			accept: "text/html",
		});
		expect(result.response.status).toBe(200);
		expect(result.response.headers.get("location")).toBeNull();
		expect(result.body).toContain("data-oidc-logout-confirmation");
		expect(result.body).not.toContain("opaque-state");
		expect(await auth.api.getSession({ headers })).not.toBeNull();
	});

	/**
	 * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html#RPLogout
	 */
	it("rejects alg=none hints as controlled errors", async () => {
		const hint = new UnsecuredJWT({ sid: "not-a-session" })
			.setIssuer(baseUrl)
			.setAudience(oauthClient!.client_id)
			.encode();
		const result = await client.oauth2.endSession({
			query: { id_token_hint: hint },
		});
		expect(result.error?.status).toBeGreaterThanOrEqual(400);
		expect(result.error?.status).toBeLessThan(500);
		expect(await auth.api.getSession({ headers })).not.toBeNull();
	});

	/**
	 * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html#Validation
	 */
	it("offers confirmation for an invalid hint without an unsafe redirect", async () => {
		const result = await requestEndSession({
			query: {
				id_token_hint: "not-a-jwt",
				post_logout_redirect_uri: "https://evil.example/logout",
			},
			accept: "text/html",
		});
		expect(result.response.status).toBe(200);
		expect(result.response.headers.get("location")).toBeNull();
		expect(result.body).toContain("data-oidc-logout-confirmation");
		expect(result.body).not.toContain("evil.example");
		expect(await auth.api.getSession({ headers })).not.toBeNull();
	});

	/**
	 * @see https://openid.net/specs/openid-connect-core-1_0.html#IDToken
	 */
	it("does not fan out client lookups across unverified hint audiences", async () => {
		const context = await auth.$context;
		const lookup = vi.spyOn(context.adapter, "findOne");
		const hint = new UnsecuredJWT({ sid: "not-a-session", sub: "test-user" })
			.setIssuer(baseUrl)
			.setAudience(
				Array.from({ length: 100 }, (_, index) => `unknown-client-${index}`),
			)
			.encode();

		try {
			const result = await requestEndSession({
				query: { id_token_hint: hint },
				accept: "text/html",
			});
			expect(result.response.status).toBe(200);
			expect(result.body).toContain("data-oidc-logout-confirmation");
			const clientLookups = lookup.mock.calls.filter(
				([query]) => query.model === "oauthClient",
			);
			expect(clientLookups).toHaveLength(0);
		} finally {
			lookup.mockRestore();
		}
	});

	/**
	 * @see https://openid.net/specs/openid-connect-core-1_0.html#IDToken
	 */
	it("resolves a valid multi-audience logout hint through azp", async () => {
		const tokens = await issueTokens();
		const payload = decodeJwt(tokens.data?.id_token!);
		const hint = await auth.api.signJWT({
			body: {
				payload: {
					...payload,
					aud: [oauthClient!.client_id, "https://other-audience.example"],
					azp: oauthClient!.client_id,
				},
			},
		});

		const result = await requestEndSession({
			query: { id_token_hint: hint!.token },
			accept: "text/html",
		});
		expect(result.response.status).toBe(200);
		expect(result.body).toContain('data-oidc-logout-state="logged-out"');
		expect(await auth.api.getSession({ headers })).toBeNull();
	});

	it("should not allow registration of rp-initiated clients, specifically enable_end_session", async () => {
		const response = await client.oauth2.register(
			{
				redirect_uris: [redirectUri],
				application_type: "native",
				post_logout_redirect_uris: [logoutRedirectUri],
				// @ts-expect-error only through adminCreateOAuthClient
				enable_end_session: true,
			},
			{
				headers,
			},
		);
		expect(response.data?.client_id).toBeDefined();
		expect(response.data?.user_id).toBeDefined();
		expect(response.data?.client_secret).toBeDefined();
		expect(response?.data?.redirect_uris).toEqual([redirectUri]);
		expect(response.data?.post_logout_redirect_uris).toEqual([
			logoutRedirectUri,
		]);
		expect(response.data?.enable_end_session).toBeUndefined();
	});

	it("should fail for clients without enable_end_session access", async () => {
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				application_type: "native",
				token_endpoint_auth_method: "client_secret_post",
				skip_consent: true,
			},
		});
		expect(response?.client_id).toBeDefined();
		expect(response?.user_id).toBeDefined();
		expect(response?.client_secret).toBeDefined();
		expect(response?.redirect_uris).toEqual([redirectUri]);
		expect(response?.enable_end_session).toBeUndefined();

		const { url: authUrl, codeVerifier } = await createAuthUrl({
			scopes,
			options: {
				clientId: response.client_id,
				clientSecret: response.client_secret,
				redirectURI: redirectUri,
			},
		});

		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			headers,
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackRedirectUrl).toContain(redirectUri);
		expect(callbackRedirectUrl).toContain(`code=`);
		expect(callbackRedirectUrl).toContain(`state=123`);
		const url = new URL(callbackRedirectUrl);

		const tokens = await validateAuthCode({
			code: url.searchParams.get("code")!,
			codeVerifier,
			options: {
				clientId: response.client_id,
				clientSecret: response.client_secret,
			},
		});
		expect(tokens.data?.access_token).toBeDefined(); // Note: Opaque
		expect(tokens.data?.id_token).toBeDefined();
		expect(tokens.data?.refresh_token).toBeDefined();
		expect(tokens.data?.scope).toBe(scopes.join(" "));

		// Id token should not have an sid claim
		const idToken = decodeJwt(tokens.data?.id_token!);
		expect(idToken.sid).toBeUndefined();

		const logoutRes = await client.oauth2.endSession({
			query: {
				id_token_hint: tokens.data?.id_token!,
			},
		});
		expect(logoutRes.error?.status).toBe(401);
	});

	it("should pass for clients with enable_end_session access", async () => {
		const { url: authUrl, codeVerifier } = await createAuthUrl({
			scopes,
		});

		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			headers,
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackRedirectUrl).toContain(redirectUri);
		expect(callbackRedirectUrl).toContain(`code=`);
		expect(callbackRedirectUrl).toContain(`state=123`);
		const url = new URL(callbackRedirectUrl);

		const tokens = await validateAuthCode({
			code: url.searchParams.get("code")!,
			codeVerifier,
		});
		expect(tokens.data?.access_token).toBeDefined(); // Note: Opaque
		expect(tokens.data?.id_token).toBeDefined();
		expect(tokens.data?.refresh_token).toBeDefined();
		expect(tokens.data?.scope).toBe(scopes.join(" "));

		// Id token should have an sid claim
		const idToken = decodeJwt(tokens.data?.id_token!);
		const sessionId = idToken.sid;
		expect(sessionId).toBeDefined();
		const sessionBefore = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(sessionBefore.data?.session.id).toBe(sessionId);

		const logoutRes = await client.oauth2.endSession({
			query: {
				id_token_hint: tokens.data?.id_token!,
			},
		});
		expect(logoutRes.data).toBeNull();
		expect(logoutRes.error).toBeNull();

		// Should have successfully logged out user
		const sessionAfter = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(sessionAfter.data).toBeNull();
		expect(sessionAfter.error).toBeNull();
	});

	/**
	 * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html#RPLogout
	 */
	it("supports a valid hint in a form POST", async () => {
		const tokens = await issueTokens();
		const result = await requestEndSession({
			method: "POST",
			body: { id_token_hint: tokens.data?.id_token! },
			accept: "application/json",
		});
		expect(result.response.status).toBe(200);
		expect(result.response.headers.get("location")).toBeNull();
		expect(await auth.api.getSession({ headers })).toBeNull();
	});

	it("supports a valid hint through the generated client", async () => {
		const tokens = await issueTokens();
		const logoutRes = await client.oauth2.endSession({
			id_token_hint: tokens.data?.id_token!,
		});
		if (logoutRes.error) {
			expect(logoutRes.error.status).toBe(302);
		} else {
			expect(logoutRes.data).toBeNull();
		}
		expect(await auth.api.getSession({ headers })).toBeNull();
	});

	/**
	 * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html#RPLogout
	 */
	it("logs out a valid hinted session without browser cookies", async () => {
		const tokens = await issueTokens();
		const requestHeaders = new Headers({ accept: "application/json" });
		const result = await customFetchImpl(
			`${endSessionEndpoint}?id_token_hint=${encodeURIComponent(tokens.data?.id_token!)}`,
			{ headers: requestHeaders },
		);
		expect(result.status).toBe(200);
		expect(await auth.api.getSession({ headers })).toBeNull();
	});

	/**
	 * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html#RPLogout
	 */
	it("requires confirmation when a valid hint conflicts with the current session", async () => {
		const currentHeaders = new Headers(headers);
		const otherSignIn = await signInWithTestUser();
		const otherTokens = await issueTokens({ headers: otherSignIn.headers });
		headers = currentHeaders;

		const result = await requestEndSession({
			query: { id_token_hint: otherTokens.data?.id_token! },
			accept: "text/html",
		});
		captureResponseCookies(result.response);
		expect(result.response.status).toBe(200);
		expect(result.body).toContain("data-oidc-logout-confirmation");
		expect(await auth.api.getSession({ headers })).not.toBeNull();
		expect(
			await auth.api.getSession({ headers: otherSignIn.headers }),
		).not.toBeNull();
	});

	/**
	 * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html#Validation
	 */
	it("rejects a bad signed hint without deleting the session", async () => {
		const tokens = await issueTokens();
		const idToken = tokens.data?.id_token!;
		const [header, payload, signature] = idToken.split(".");
		const replacement = signature?.[0] === "A" ? "B" : "A";
		const badHint = [
			header,
			payload,
			`${replacement}${signature?.slice(1)}`,
		].join(".");
		const result = await client.oauth2.endSession({
			query: { id_token_hint: badHint },
		});
		expect(result.error?.status).toBeGreaterThanOrEqual(400);
		expect(result.error?.status).toBeLessThan(500);
		expect(await auth.api.getSession({ headers })).not.toBeNull();
	});

	/**
	 * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html#Redirection
	 */
	it("logs out and suppresses an unregistered post-logout redirect", async () => {
		const redirectClient = await createLogoutRedirectClient();
		const tokens = await issueTokens({ client: redirectClient });
		const result = await requestEndSession({
			query: {
				id_token_hint: tokens.data?.id_token!,
				post_logout_redirect_uri: "https://evil.example/logout",
			},
			accept: "text/html",
		});
		expect(result.response.status).toBe(200);
		expect(result.response.headers.get("location")).toBeNull();
		expect(result.body).toContain('data-oidc-logout-state="logged-out"');
		expect(result.body).toContain("Logged out");
		expect(result.body).not.toContain("evil.example");
		expect(result.body).not.toContain("attacker");
		expect(await auth.api.getSession({ headers })).toBeNull();
	});

	/**
	 * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html#Redirection
	 */
	it("logs out and suppresses a query-added post-logout redirect", async () => {
		const redirectClient = await createLogoutRedirectClient();
		const tokens = await issueTokens({ client: redirectClient });
		const result = await requestEndSession({
			query: {
				id_token_hint: tokens.data?.id_token!,
				post_logout_redirect_uri: `${logoutRedirectUri}?attacker=1`,
			},
			accept: "text/html",
		});
		expect(result.response.status).toBe(200);
		expect(result.response.headers.get("location")).toBeNull();
		expect(result.body).toContain('data-oidc-logout-state="logged-out"');
		expect(result.body).toContain("Logged out");
		expect(result.body).not.toContain("attacker");
		expect(await auth.api.getSession({ headers })).toBeNull();
	});

	/**
	 * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html#Validation
	 */
	it("surfaces session deletion failures without redirecting as successful", async () => {
		const tokens = await issueTokens();
		const context = await auth.$context;
		const deletion = vi
			.spyOn(context.internalAdapter, "deleteSession")
			.mockRejectedValue(new Error("adapter failure"));
		try {
			const result = await client.oauth2.endSession({
				query: { id_token_hint: tokens.data?.id_token! },
			});
			expect(result.error?.status).toBeGreaterThanOrEqual(500);
			expect(result.error?.status).toBeLessThan(600);
			expect(await auth.api.getSession({ headers })).not.toBeNull();
		} finally {
			deletion.mockRestore();
		}
	});

	it("should pass with redirection", async () => {
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				application_type: "native",
				token_endpoint_auth_method: "client_secret_post",
				enable_end_session: true,
				skip_consent: true,
				post_logout_redirect_uris: [logoutRedirectUri],
			},
		});
		expect(response?.client_id).toBeDefined();
		expect(response?.user_id).toBeDefined();
		expect(response?.client_secret).toBeDefined();
		expect(response?.redirect_uris).toEqual([redirectUri]);
		expect(response.post_logout_redirect_uris).toEqual([logoutRedirectUri]);
		expect(response?.enable_end_session).toBe(true);

		const { url: authUrl, codeVerifier } = await createAuthUrl({
			scopes,
			options: {
				clientId: response.client_id,
				clientSecret: response.client_secret,
				redirectURI: redirectUri,
			},
		});

		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			headers,
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackRedirectUrl).toContain(redirectUri);
		expect(callbackRedirectUrl).toContain(`code=`);
		expect(callbackRedirectUrl).toContain(`state=123`);
		const url = new URL(callbackRedirectUrl);

		const tokens = await validateAuthCode({
			code: url.searchParams.get("code")!,
			codeVerifier,
			options: {
				clientId: response.client_id,
				clientSecret: response.client_secret,
			},
		});
		expect(tokens.data?.access_token).toBeDefined(); // Note: Opaque
		expect(tokens.data?.id_token).toBeDefined();
		expect(tokens.data?.refresh_token).toBeDefined();
		expect(tokens.data?.scope).toBe(scopes.join(" "));

		// Id token should have an sid claim
		const idToken = decodeJwt(tokens.data?.id_token!);
		const sessionId = idToken.sid;
		expect(sessionId).toBeDefined();

		let logoutRedirectRes = "";
		const logoutRes = await client.oauth2.endSession(
			{
				query: {
					id_token_hint: tokens.data?.id_token!,
					post_logout_redirect_uri: logoutRedirectUri,
					state: "123",
				},
			},
			{
				onResponse(ctx) {
					logoutRedirectRes = ctx.response.headers.get("Location") || "";
				},
			},
		);
		expect(logoutRedirectRes).toContain(logoutRedirectUri);
		expect(logoutRedirectRes).toContain("state=123");
		expect(logoutRes.error?.status).toBe(302);
	});
});

describe("oauth logout confirmation with a custom base path", async () => {
	const baseUrl = "http://localhost:3006";
	const basePath = "/custom/auth";
	const { auth, client, signInWithTestUser } = await getTestInstance(
		{
			baseURL: baseUrl,
			basePath,
			plugins: [
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					scopes: ["openid"],
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

	it("uses the custom base path for confirmation navigation and cookies", async () => {
		const { headers } = await signInWithTestUser();
		const response = await auth.handler(
			new Request(`${baseUrl}${basePath}/oauth2/end-session`, {
				headers: {
					accept: "text/html",
					cookie: headers.get("cookie") ?? "",
				},
			}),
		);
		const body = await response.text();
		const confirmationURL = `${baseUrl}${basePath}/oauth2/end-session/confirm`;
		expect(response.status).toBe(200);
		expect(body).toContain(`action="${confirmationURL}"`);

		const cookies = parseSetCookieHeader(
			response.headers.get("set-cookie") ?? "",
		);
		const confirmationCookie = Array.from(cookies.entries()).find(([name]) =>
			name.endsWith(".oauth_logout_confirmation"),
		);
		expect(confirmationCookie?.[1].path).toBe(
			`${basePath}/oauth2/end-session/confirm`,
		);

		// @ts-expect-error HTTP-scoped endpoints are excluded from the server API.
		auth.api.oauth2EndSessionConfirmation;
		// @ts-expect-error HTTP-scoped endpoints are excluded from generated clients.
		client.oauth2.endSessionConfirmation;
		if (false) {
			// @ts-expect-error The internal confirmation action is not public logout input.
			client.oauth2.endSession({ action: "confirm" });
		}
	});
});

describe("oauth logout - disableJwtPlugin", async () => {
	const port = 3005;
	const baseUrl = `http://localhost:${port}`;
	const rpBaseUrl = "http://localhost:5000";
	const state = "123";
	const scopes = ["openid", "email", "profile", "offline_access"];

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: baseUrl,
		plugins: [
			oauthProvider({
				disableJwtPlugin: true,
				loginPage: "/login",
				consentPage: "/consent",
				allowDynamicClientRegistration: true,
				scopes,
			}),
			jwt(),
		],
	});
	let { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: baseUrl,
		fetchOptions: {
			customFetchImpl,
		},
	});
	let oauthClient: OAuthClient | null;
	let server: Listener;

	const providerId = "test";
	const redirectUri = `${rpBaseUrl}/api/auth/callback/${providerId}`;
	const logoutRedirectUri = `${rpBaseUrl}/api/auth/callback/logout`;

	// Registers a confidential client application to work with
	beforeAll(async () => {
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				application_type: "native",
				token_endpoint_auth_method: "client_secret_post",
				skip_consent: true,
				enable_end_session: true,
			},
		});
		expect(response?.client_id).toBeDefined();
		expect(response?.user_id).toBeDefined();
		expect(response?.client_secret).toBeDefined();
		expect(response?.redirect_uris).toEqual([redirectUri]);
		expect(response?.enable_end_session).toEqual(true);
		oauthClient = response;

		server = await listen(toNodeHandler(auth.handler), {
			port,
		});
	});

	afterAll(async () => {
		if (server) {
			await server.close();
		}
	});

	// Login again after each test
	beforeEach(async () => {
		const { headers: _headers } = await signInWithTestUser();
		headers = _headers;
	});

	async function createAuthUrl(
		overrides?: Partial<Parameters<typeof createAuthorizationURL>[0]>,
	) {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}
		const codeVerifier = generateRandomString(32);
		const url = await createAuthorizationURL({
			id: providerId,
			options: {
				clientId: oauthClient?.client_id,
				clientSecret: oauthClient?.client_secret,
				redirectURI: redirectUri,
				...overrides?.options,
			},
			redirectURI: "",
			authorizationEndpoint: `${baseUrl}/api/auth/oauth2/authorize`,
			state,
			scopes: ["openid", "profile", "email", "offline_access"],
			codeVerifier,
			...overrides,
		});
		return {
			url,
			codeVerifier,
		};
	}

	async function validateAuthCode(
		overrides: MakeRequired<
			Partial<Parameters<typeof authorizationCodeRequest>[0]>,
			"code"
		>,
	) {
		if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}

		const { body, headers } = await authorizationCodeRequest({
			...overrides,
			redirectURI: redirectUri,
			options: {
				clientId: oauthClient.client_id,
				clientSecret: oauthClient.client_secret,
				redirectURI: redirectUri,
				...overrides.options,
			},
		});

		const tokens = await client.$fetch<{
			access_token?: string;
			id_token?: string;
			refresh_token?: string;
			expires_in?: number;
			expires_at?: number;
			token_type?: string;
			scope?: string;
			[key: string]: unknown;
		}>("/oauth2/token", {
			method: "POST",
			body: body,
			headers: headers,
		});

		return tokens;
	}

	it("should pass for clients with enable_end_session access", async () => {
		const { url: authUrl, codeVerifier } = await createAuthUrl({
			scopes,
		});

		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			headers,
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackRedirectUrl).toContain(redirectUri);
		expect(callbackRedirectUrl).toContain(`code=`);
		expect(callbackRedirectUrl).toContain(`state=123`);
		const url = new URL(callbackRedirectUrl);

		const tokens = await validateAuthCode({
			code: url.searchParams.get("code")!,
			codeVerifier,
		});
		expect(tokens.data?.access_token).toBeDefined(); // Note: Opaque
		expect(tokens.data?.id_token).toBeDefined();
		expect(tokens.data?.refresh_token).toBeDefined();
		expect(tokens.data?.scope).toBe(scopes.join(" "));

		// Id token should have an sid claim
		const idToken = decodeJwt(tokens.data?.id_token!);
		const sessionId = idToken.sid;
		expect(sessionId).toBeDefined();
		const sessionBefore = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(sessionBefore.data?.session.id).toBe(sessionId);

		const logoutRes = await client.oauth2.endSession({
			query: {
				id_token_hint: tokens.data?.id_token!,
			},
		});
		expect(logoutRes.data).toBeNull();
		expect(logoutRes.error).toBeNull();

		// Should have successfully logged out user
		const sessionAfter = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(sessionAfter.data).toBeNull();
		expect(sessionAfter.error).toBeNull();
	});

	it("should pass with redirection", async () => {
		const response = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				application_type: "native",
				token_endpoint_auth_method: "client_secret_post",
				enable_end_session: true,
				skip_consent: true,
				post_logout_redirect_uris: [logoutRedirectUri],
			},
		});
		expect(response?.client_id).toBeDefined();
		expect(response?.user_id).toBeDefined();
		expect(response?.client_secret).toBeDefined();
		expect(response?.redirect_uris).toEqual([redirectUri]);
		expect(response.post_logout_redirect_uris).toEqual([logoutRedirectUri]);
		expect(response?.enable_end_session).toBe(true);

		const { url: authUrl, codeVerifier } = await createAuthUrl({
			scopes,
			options: {
				clientId: response.client_id,
				clientSecret: response.client_secret,
				redirectURI: redirectUri,
			},
		});

		let callbackRedirectUrl = "";
		await client.$fetch(authUrl.toString(), {
			headers,
			onError(context) {
				callbackRedirectUrl = context.response.headers.get("Location") || "";
			},
		});
		expect(callbackRedirectUrl).toContain(redirectUri);
		expect(callbackRedirectUrl).toContain(`code=`);
		expect(callbackRedirectUrl).toContain(`state=123`);
		const url = new URL(callbackRedirectUrl);

		const tokens = await validateAuthCode({
			code: url.searchParams.get("code")!,
			codeVerifier,
			options: {
				clientId: response.client_id,
				clientSecret: response.client_secret,
			},
		});
		expect(tokens.data?.access_token).toBeDefined(); // Note: Opaque
		expect(tokens.data?.id_token).toBeDefined();
		expect(tokens.data?.refresh_token).toBeDefined();
		expect(tokens.data?.scope).toBe(scopes.join(" "));

		// Id token should have an sid claim
		const idToken = decodeJwt(tokens.data?.id_token!);
		const sessionId = idToken.sid;
		expect(sessionId).toBeDefined();

		let logoutRedirectRes = "";
		const logoutRes = await client.oauth2.endSession(
			{
				query: {
					id_token_hint: tokens.data?.id_token!,
					post_logout_redirect_uri: logoutRedirectUri,
				},
			},
			{
				onResponse(ctx) {
					logoutRedirectRes = ctx.response.headers.get("Location") || "";
				},
			},
		);
		expect(logoutRedirectRes).toBe(logoutRedirectUri);
		expect(logoutRes.error?.status).toBe(302);
	});
});
