import { afterEach, describe, expect, it, vi } from "vitest";
import { parseCookies } from "../../cookies";
import { getTestInstance } from "../../test-utils/test-instance";

/**
 * @see https://github.com/better-auth/better-auth/issues/9233
 *
 * When `crossSubDomainCookies` is enabled for the first time on a live deployment,
 * the browser ends up holding two cookies with the same name but different scopes:
 * - Old `session_data` with Domain=www.app.example.com (issued before the change)
 * - New `session_data` with Domain=.example.com (issued after the change)
 *
 * Per RFC 6265, the older cookie is listed first in the Cookie header.
 * When HMAC verification fails on the old `session_data` cookie, Better Auth
 * should fall through to validate `session_token` against the database
 * instead of immediately returning null.
 */
describe("cookieCache HMAC verification failure fallback", async () => {
	afterEach(() => {
		vi.useRealTimers();
	});
	it("should fall through to session_token DB validation when session_data HMAC fails", async () => {
		const { client, testUser, cookieSetter } = await getTestInstance({
			session: {
				cookieCache: {
					enabled: true,
					strategy: "compact",
				},
			},
		});

		const headers = new Headers();

		// Sign in to get valid session_token and session_data cookies
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);

		// Verify initial session works
		const initialSession = await client.getSession({
			fetchOptions: { headers },
		});
		expect(initialSession.data).not.toBeNull();
		expect(initialSession.data?.user.email).toBe(testUser.email);

		// Now simulate the cross-subdomain migration scenario:
		// The browser has TWO session_data cookies, and per RFC 6265, the older
		// (stale) one comes first. We simulate this by replacing session_data
		// with an invalid value while keeping session_token valid.
		const cookieStr = headers.get("cookie") || "";
		const cookies = parseCookies(cookieStr);

		// Get the valid session_token
		const sessionToken = cookies.get("better-auth.session_token");
		expect(sessionToken).toBeDefined();

		// Create a new headers object with:
		// 1. An INVALID session_data cookie (simulates the old cookie with wrong signature)
		// 2. The VALID session_token cookie
		const tampered = new Headers();

		// Set invalid session_data first (simulating the older cookie that comes first per RFC 6265)
		// This is base64-encoded JSON with an invalid signature
		const invalidSessionData = btoa(
			JSON.stringify({
				session: {
					session: { token: "fake", userId: "fake" },
					user: { id: "fake", email: "fake@example.com" },
					updatedAt: Date.now(),
				},
				expiresAt: Date.now() + 1000 * 60 * 5,
				signature: "invalid-signature-that-will-fail-hmac-verification",
			}),
		);
		tampered.set(
			"cookie",
			`better-auth.session_data=${invalidSessionData}; better-auth.session_token=${sessionToken}`,
		);

		// Should return the valid session by falling through to DB validation
		const session = await client.getSession({
			fetchOptions: { headers: tampered },
		});

		expect(session.data).not.toBeNull();
		expect(session.data?.user.email).toBe(testUser.email);
	});

	it("should still return null when both session_data and session_token are invalid", async () => {
		const { client, testUser, cookieSetter } = await getTestInstance({
			session: {
				cookieCache: {
					enabled: true,
					strategy: "compact",
				},
			},
		});

		const headers = new Headers();

		// Sign in first to ensure the user exists
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);

		// Create headers with both invalid session_data and invalid session_token
		const tampered = new Headers();
		const invalidSessionData = btoa(
			JSON.stringify({
				session: {
					session: { token: "fake", userId: "fake" },
					user: { id: "fake", email: "fake@example.com" },
					updatedAt: Date.now(),
				},
				expiresAt: Date.now() + 1000 * 60 * 5,
				signature: "invalid-signature",
			}),
		);
		tampered.set(
			"cookie",
			`better-auth.session_data=${invalidSessionData}; better-auth.session_token=invalid-token.invalid-signature`,
		);

		// Should return null since both cookies are invalid
		const session = await client.getSession({
			fetchOptions: { headers: tampered },
		});

		expect(session.data).toBeNull();
	});

	it("should work with JWT strategy when HMAC verification fails", async () => {
		const { client, testUser, cookieSetter } = await getTestInstance({
			session: {
				cookieCache: {
					enabled: true,
					strategy: "jwt",
				},
			},
		});

		const headers = new Headers();

		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);

		const cookieStr = headers.get("cookie") || "";
		const cookies = parseCookies(cookieStr);
		const sessionToken = cookies.get("better-auth.session_token");

		// Create tampered headers with invalid JWT but valid session_token
		const tampered = new Headers();
		tampered.set(
			"cookie",
			`better-auth.session_data=invalid.jwt.token; better-auth.session_token=${sessionToken}`,
		);

		// Should fall through to DB validation
		const session = await client.getSession({
			fetchOptions: { headers: tampered },
		});

		expect(session.data).not.toBeNull();
		expect(session.data?.user.email).toBe(testUser.email);
	});

	it("should work with JWE strategy when decryption fails", async () => {
		const { client, testUser, cookieSetter } = await getTestInstance({
			session: {
				cookieCache: {
					enabled: true,
					strategy: "jwe",
				},
			},
		});

		const headers = new Headers();

		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);

		const cookieStr = headers.get("cookie") || "";
		const cookies = parseCookies(cookieStr);
		const sessionToken = cookies.get("better-auth.session_token");

		// Create tampered headers with invalid JWE but valid session_token
		const tampered = new Headers();
		tampered.set(
			"cookie",
			`better-auth.session_data=invalid.jwe.token.here.test; better-auth.session_token=${sessionToken}`,
		);

		// Should fall through to DB validation
		const session = await client.getSession({
			fetchOptions: { headers: tampered },
		});

		expect(session.data).not.toBeNull();
		expect(session.data?.user.email).toBe(testUser.email);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9233
	 *
	 * This test emulates the exact scenario from the issue:
	 *
	 * Scenario: User has a valid session, but browser sends a stale/expired
	 * session_data cookie (e.g., from cross-subdomain migration where old
	 * Domain=www.app.example.com cookie arrives before new Domain=.example.com cookie)
	 *
	 * Step 1: User signs in, gets valid session_token and session_data
	 * Step 2: Wait for cookieCache.maxAge to expire (session_data becomes stale)
	 * Step 3: Simulate browser sending expired session_data but valid session_token
	 *
	 * Without fix: When session_data is expired/invalid, returns null (silent logout)
	 * With fix: Falls through to session_token DB validation -> session restored
	 */
	it("should handle cross-subdomain cookie migration without silent logout", async () => {
		const { client, testUser, cookieSetter } = await getTestInstance({
			baseURL: "https://www.app.example.com",
			session: {
				cookieCache: {
					enabled: true,
					maxAge: 10, // Short window as described in issue
				},
			},
			advanced: {
				crossSubDomainCookies: {
					enabled: true,
					domain: ".example.com",
				},
			},
		});

		const headers = new Headers();

		// Step 1: User signs in - gets session_token and session_data
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);

		// Extract the valid session_token
		const cookieStr = headers.get("cookie") || "";
		const cookies = parseCookies(cookieStr);
		const sessionToken =
			cookies.get("__Secure-better-auth.session_token") ||
			cookies.get("better-auth.session_token");
		expect(sessionToken).toBeDefined();

		// Verify initial session works
		const initialSession = await client.getSession({
			fetchOptions: { headers },
		});
		expect(initialSession.data).not.toBeNull();

		// Step 2 & 3: Simulate the cross-subdomain migration scenario
		// Browser has OLD session_data (from Domain=www.app.example.com) that arrives first
		// The old session_data has expired OR has invalid signature due to migration
		const migrationHeaders = new Headers();

		// Create a stale/expired session_data that simulates the old cookie
		// Per RFC 6265, the older cookie (Domain=www.app.example.com) arrives FIRST
		const staleSessionData = btoa(
			JSON.stringify({
				session: {
					session: {
						token: "old-session-token",
						userId: "old-user-id",
						expiresAt: new Date(Date.now() - 1000).toISOString(),
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
					},
					user: {
						id: "old-user-id",
						email: testUser.email,
						name: testUser.name,
						emailVerified: false,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
					},
					updatedAt: Date.now() - 60000, // 1 minute ago
				},
				expiresAt: Date.now() - 1000, // Already expired
				signature: "stale-signature-from-old-domain-cookie",
			}),
		);

		// Send the stale session_data first (as browser would per RFC 6265)
		// followed by the valid session_token
		migrationHeaders.set(
			"cookie",
			`__Secure-better-auth.session_data=${staleSessionData}; __Secure-better-auth.session_token=${sessionToken}`,
		);

		// Step 3: Simulate visibilitychange -> useSession() refetch
		// The stale session_data cookie is read, HMAC verification fails
		const session = await client.getSession({
			fetchOptions: { headers: migrationHeaders },
		});

		// Without the fix: session.data would be null (silent logout)
		// With the fix: Falls through to session_token DB validation
		expect(session.data).not.toBeNull();
		expect(session.data?.user.email).toBe(testUser.email);
	});

	/**
	 * Same scenario but with shorter timing - verifying the bug is timing-dependent
	 * on cookieCache.maxAge as described in the issue
	 */
	it("should work during cookieCache window even with stale session_data", async () => {
		const { client, testUser, cookieSetter } = await getTestInstance({
			session: {
				cookieCache: {
					enabled: true,
					maxAge: 60, // 60 seconds
				},
			},
		});

		const headers = new Headers();

		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);

		// Verify session works initially
		const initialSession = await client.getSession({
			fetchOptions: { headers },
		});
		expect(initialSession.data).not.toBeNull();

		// Get the valid session_token
		const cookieStr = headers.get("cookie") || "";
		const cookies = parseCookies(cookieStr);
		const sessionToken = cookies.get("better-auth.session_token");

		// Simulate the migration scenario with stale session_data but valid session_token
		const migrationHeaders = new Headers();
		const staleSessionData = btoa(
			JSON.stringify({
				session: {
					session: { token: "stale", userId: "stale" },
					user: { id: "stale", email: "stale@example.com" },
					updatedAt: Date.now() - 1000 * 60 * 60, // 1 hour ago
				},
				expiresAt: Date.now() - 1000, // Already expired
				signature: "stale-signature-from-old-deployment",
			}),
		);
		migrationHeaders.set(
			"cookie",
			`better-auth.session_data=${staleSessionData}; better-auth.session_token=${sessionToken}`,
		);

		// Even with expired/stale session_data, should fall through to DB validation
		const session = await client.getSession({
			fetchOptions: { headers: migrationHeaders },
		});

		expect(session.data).not.toBeNull();
		expect(session.data?.user.email).toBe(testUser.email);
	});
});
