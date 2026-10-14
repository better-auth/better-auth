import { describe, expect, it } from "vitest";
import type { CookieAttributes } from "../../cookies";
import { parseSetCookieHeader } from "../../cookies";
import { bearer } from "../../plugins/bearer";
import { getTestInstance } from "../../test-utils/test-instance";

/**
 * When the caller revokes the session they are calling from, the response
 * must expire the session cookies (and the cookie cache), matching sign-out.
 * Otherwise a `session.cookieCache` deployment keeps validating the revoked
 * session from the stale `session_data` cookie until the cache expires.
 *
 * Revoking a *different* session must leave the caller's cookies alone.
 *
 * @see https://github.com/better-auth/better-auth/issues/11690
 */
describe("session revocation clears cookies", () => {
	const cookieCache = {
		enabled: true,
		maxAge: 5 * 60,
	} as const;

	it("revokeSession expires the caller cookies when revoking the current session", async () => {
		const { client, signInWithTestUser, cookieSetter } = await getTestInstance({
			session: { cookieCache },
		});
		const { headers } = await signInWithTestUser();
		// populate the cookie cache (session_data cookie)
		const sessionBefore = await client.getSession({
			fetchOptions: { headers, onSuccess: cookieSetter(headers) },
		});
		expect(sessionBefore.data?.session?.token).toBeDefined();

		let setCookieHeader = "";
		const revokeRes = await client.revokeSession({
			token: sessionBefore.data!.session!.token,
			fetchOptions: {
				headers,
				onSuccess(context) {
					setCookieHeader = context.response.headers.get("set-cookie") || "";
					cookieSetter(headers)(context);
				},
			},
		});
		expect(revokeRes.data?.status).toBe(true);

		const responseCookies = parseSetCookieHeader(setCookieHeader);
		expect(responseCookies.get("better-auth.session_token")?.["max-age"]).toBe(
			0,
		);
		expect(responseCookies.get("better-auth.session_data")?.["max-age"]).toBe(
			0,
		);

		// with the expired cookies applied, getSession must not resurrect the
		// revoked session from the stale cookie cache
		const sessionAfter = await client.getSession({
			fetchOptions: { headers },
		});
		expect(sessionAfter.data).toBeNull();
	});

	it("revokeSession keeps the caller cookies when revoking another session", async () => {
		const { client, signInWithTestUser, cookieSetter } = await getTestInstance({
			session: { cookieCache },
		});
		const { headers } = await signInWithTestUser();
		const { headers: otherHeaders } = await signInWithTestUser();
		const currentSession = await client.getSession({
			fetchOptions: { headers, onSuccess: cookieSetter(headers) },
		});
		const otherSession = await client.getSession({
			fetchOptions: {
				headers: otherHeaders,
				onSuccess: cookieSetter(otherHeaders),
			},
		});
		expect(otherSession.data?.session?.token).toBeDefined();
		expect(currentSession.data!.session!.token).not.toBe(
			otherSession.data!.session!.token,
		);

		let setCookieHeader = "";
		const revokeRes = await client.revokeSession({
			token: otherSession.data!.session!.token,
			fetchOptions: {
				headers,
				onSuccess(context) {
					setCookieHeader = context.response.headers.get("set-cookie") || "";
					cookieSetter(headers)(context);
				},
			},
		});
		expect(revokeRes.data?.status).toBe(true);

		const responseCookies = parseSetCookieHeader(setCookieHeader);
		// the caller's session token must not be expired: revoking another
		// device's session returns no Set-Cookie for it at all
		expect(responseCookies.has("better-auth.session_token")).toBe(false);
		// the caller's cookie cache must not be expired either. Note it may
		// still legitimately appear as a *refresh* (max-age = the configured
		// cache lifetime) because resolving the session for this request
		// re-issued the cache cookie, so absence alone cannot be asserted -
		// only that it is not an expiry.
		expect(
			responseCookies.get("better-auth.session_data")?.["max-age"],
		).not.toBe(0);

		// the revoked session is really gone: an authoritative (cache
		// bypassing) read with the revoked device's cookies finds nothing.
		// The revoked device's own cookie cache may still vouch for it
		// until it expires - the server cannot expire another device's
		// cookies - which is why the bypass query is required here.
		const revokedSessionAfter = await client.getSession({
			query: { disableCookieCache: true },
			fetchOptions: { headers: otherHeaders },
		});
		expect(revokedSessionAfter.data).toBeNull();

		// the caller's own session stays alive
		const sessionAfter = await client.getSession({
			fetchOptions: { headers },
		});
		expect(sessionAfter.data?.session?.token).toBe(
			currentSession.data!.session!.token,
		);
	});

	it("revokeSessions expires the caller cookies and the cookie cache", async () => {
		const { client, signInWithTestUser, cookieSetter } = await getTestInstance({
			session: { cookieCache },
		});
		const { headers } = await signInWithTestUser();
		const sessionBefore = await client.getSession({
			fetchOptions: { headers, onSuccess: cookieSetter(headers) },
		});
		expect(sessionBefore.data?.session?.token).toBeDefined();

		let setCookieHeader = "";
		const revokeRes = await client.revokeSessions({
			fetchOptions: {
				headers,
				onSuccess(context) {
					setCookieHeader = context.response.headers.get("set-cookie") || "";
					cookieSetter(headers)(context);
				},
			},
		});
		expect(revokeRes.data?.status).toBe(true);

		const responseCookies = parseSetCookieHeader(setCookieHeader);
		expect(responseCookies.get("better-auth.session_token")?.["max-age"]).toBe(
			0,
		);
		expect(responseCookies.get("better-auth.session_data")?.["max-age"]).toBe(
			0,
		);

		const sessionAfter = await client.getSession({
			fetchOptions: { headers },
		});
		expect(sessionAfter.data).toBeNull();
	});

	it("revokeSession does not expire the browser cookies when the revoked session is the bearer one", async () => {
		// cubic's bearer edge case: the request carries the bearer plugin's
		// Authorization header for one session while the browser cookie jar
		// holds a different, unrelated session. Revoking the bearer session
		// must not expire the cookies of the session the jar actually holds.
		const { client, signInWithTestUser, cookieSetter } = await getTestInstance({
			session: { cookieCache },
			plugins: [bearer()],
		});
		const { headers } = await signInWithTestUser();
		const { headers: otherHeaders } = await signInWithTestUser();
		const currentSession = await client.getSession({
			fetchOptions: { headers, onSuccess: cookieSetter(headers) },
		});
		const otherSession = await client.getSession({
			fetchOptions: {
				headers: otherHeaders,
				onSuccess: cookieSetter(otherHeaders),
			},
		});
		expect(currentSession.data?.session?.token).toBeDefined();
		expect(otherSession.data?.session?.token).toBeDefined();
		expect(currentSession.data!.session!.token).not.toBe(
			otherSession.data!.session!.token,
		);

		// the caller's cookie jar holds the current session, but the request
		// authorizes with the OTHER session's bearer token
		const bearerToken = otherSession.data!.session!.token;
		const requestHeaders = new Headers(headers);
		requestHeaders.set("authorization", `Bearer ${bearerToken}`);

		let setCookieHeader = "";
		const revokeRes = await client.revokeSession({
			token: bearerToken,
			fetchOptions: {
				headers: requestHeaders,
				onSuccess(context) {
					setCookieHeader = context.response.headers.get("set-cookie") || "";
				},
			},
		});
		expect(revokeRes.data?.status).toBe(true);

		const responseCookies = parseSetCookieHeader(setCookieHeader);
		// the browser still holds the current session's cookies and that
		// session is still alive, so nothing may be expired. The cookie
		// cache may appear as a refresh (see the non-bearer test above), so
		// assert it is not an expiry rather than absent.
		expect(responseCookies.has("better-auth.session_token")).toBe(false);
		expect(
			responseCookies.get("better-auth.session_data")?.["max-age"],
		).not.toBe(0);

		// the session the jar holds keeps validating requests
		const sessionAfter = await client.getSession({
			fetchOptions: { headers },
		});
		expect(sessionAfter.data?.session?.token).toBe(
			currentSession.data!.session!.token,
		);
	});

	it("revokeSession expires the caller cookies when the bearer token is the session the cookie jar holds", async () => {
		// the positive twin: the request's Authorization token and the
		// browser's cookie jar point at the SAME session, so revoking it must
		// still expire the cookies, bearer plugin or not
		const { client, signInWithTestUser, cookieSetter } = await getTestInstance({
			session: { cookieCache },
			plugins: [bearer()],
		});
		const { headers } = await signInWithTestUser();
		const sessionBefore = await client.getSession({
			fetchOptions: { headers, onSuccess: cookieSetter(headers) },
		});
		expect(sessionBefore.data?.session?.token).toBeDefined();

		const bearerToken = sessionBefore.data!.session!.token;
		const requestHeaders = new Headers(headers);
		requestHeaders.set("authorization", `Bearer ${bearerToken}`);

		let setCookieHeader = "";
		const revokeRes = await client.revokeSession({
			token: bearerToken,
			fetchOptions: {
				headers: requestHeaders,
				onSuccess(context) {
					setCookieHeader = context.response.headers.get("set-cookie") || "";
					cookieSetter(headers)(context);
				},
			},
		});
		expect(revokeRes.data?.status).toBe(true);

		const responseCookies = parseSetCookieHeader(setCookieHeader);
		expect(responseCookies.get("better-auth.session_token")?.["max-age"]).toBe(
			0,
		);
		expect(responseCookies.get("better-auth.session_data")?.["max-age"]).toBe(
			0,
		);

		const sessionAfter = await client.getSession({
			fetchOptions: { headers },
		});
		expect(sessionAfter.data).toBeNull();
	});

	it("auth.api.revokeSession (server-side, no Request) expires the cookies when the cookie and the bearer token are the same session", async () => {
		// greptile review: a server calls auth.api.revokeSession with
		// headers but no request. When the Authorization header names the
		// SAME session the cookie jar holds, the revocation must still
		// expire the cookies: the bearer plugin swaps the session cookie
		// inside ctx.headers in flight, so the decision must be made
		// against the cookie header the caller actually sent, which the
		// dispatch captures before any before-hook runs. The old guard
		// skipped every call carrying an Authorization header, so the
		// revoked session's cookies survived - and with cookie caching
		// on, getSession kept resolving the revoked session.
		const { client, auth, signInWithTestUser, cookieSetter } =
			await getTestInstance({
				session: { cookieCache },
				plugins: [bearer()],
			});
		const { headers } = await signInWithTestUser();
		const sessionBefore = await client.getSession({
			fetchOptions: { headers, onSuccess: cookieSetter(headers) },
		});
		const sessionToken = sessionBefore.data!.session!.token;
		expect(sessionToken).toBeDefined();

		// the server call carries both the browser cookie and an
		// Authorization header for the same session, but no Request
		const serverHeaders = new Headers(headers);
		serverHeaders.set("authorization", `Bearer ${sessionToken}`);

		const result = (await auth.api.revokeSession({
			body: { token: sessionToken },
			headers: serverHeaders,
			returnHeaders: true,
		})) as unknown as { headers: Headers | null };

		// parse each Set-Cookie entry on its own: a collapsed
		// `get("set-cookie")` (or a "; "-joined array) loses the comma
		// boundaries splitSetCookieHeader splits on, silently folding the
		// second expiry cookie into the first one's attributes
		const setCookieEntries = result.headers?.getSetCookie?.() ?? [];
		const responseCookies = new Map<string, CookieAttributes>();
		for (const entry of setCookieEntries) {
			for (const [name, attributes] of parseSetCookieHeader(entry)) {
				responseCookies.set(name, attributes);
			}
		}
		expect(responseCookies.get("better-auth.session_token")?.["max-age"]).toBe(
			0,
		);
		expect(responseCookies.get("better-auth.session_data")?.["max-age"]).toBe(
			0,
		);
	});

	it("revokeSessions does not expire the cookies when the bearer token is another user's", async () => {
		// the batch endpoint's bearer edge case: the request authorizes with
		// one user's bearer token while the cookie jar holds a different
		// user's session. deleteUserSessions removes only the bearer user's
		// sessions, so the response must not expire the other user's cookies,
		// and the other user's session must survive the revocation.
		const { client, signInWithTestUser, signInWithUser, cookieSetter } =
			await getTestInstance({
				session: { cookieCache },
				plugins: [bearer()],
			});
		await client.signUp.email({
			name: "other user",
			email: "other-user@example.com",
			password: "other-user-123456",
		});
		const { headers: otherHeaders } = await signInWithUser(
			"other-user@example.com",
			"other-user-123456",
		);
		const otherSession = await client.getSession({
			fetchOptions: {
				headers: otherHeaders,
				onSuccess: cookieSetter(otherHeaders),
			},
		});
		expect(otherSession.data?.session?.token).toBeDefined();

		const { headers } = await signInWithTestUser();
		const currentSession = await client.getSession({
			fetchOptions: { headers, onSuccess: cookieSetter(headers) },
		});
		const bearerToken = currentSession.data!.session!.token;

		// the request authorizes as the test user, but the cookie jar holds
		// the other user's session
		const requestHeaders = new Headers(otherHeaders);
		requestHeaders.set("authorization", `Bearer ${bearerToken}`);

		let setCookieHeader = "";
		const revokeRes = await client.revokeSessions({
			fetchOptions: {
				headers: requestHeaders,
				onSuccess(context) {
					setCookieHeader = context.response.headers.get("set-cookie") || "";
				},
			},
		});
		expect(revokeRes.data?.status).toBe(true);

		const responseCookies = parseSetCookieHeader(setCookieHeader);
		// the other user's session token cookie is not the caller's to expire
		expect(responseCookies.has("better-auth.session_token")).toBe(false);
		// the cookie cache may legitimately appear as a refresh (see the
		// single-session tests), so only assert it is not an expiry
		expect(
			responseCookies.get("better-auth.session_data")?.["max-age"],
		).not.toBe(0);

		// the other user's session is untouched and keeps validating
		const otherSessionAfter = await client.getSession({
			fetchOptions: { headers: otherHeaders },
		});
		expect(otherSessionAfter.data?.session?.token).toBe(
			otherSession.data!.session!.token,
		);
	});

	it("revokeSessions leaves a bearer-only caller's response free of expiry cookies", async () => {
		// the batch endpoint's twin of the helper's bearer-only contract: a
		// caller that holds no session cookie at all must not receive
		// Set-Cookie expiry headers for cookies it never had
		const { client, signInWithTestUser, cookieSetter } = await getTestInstance({
			session: { cookieCache },
			plugins: [bearer()],
		});
		const { headers } = await signInWithTestUser();
		const sessionBefore = await client.getSession({
			fetchOptions: { headers, onSuccess: cookieSetter(headers) },
		});
		const bearerToken = sessionBefore.data!.session!.token;

		let setCookieHeader = "";
		const revokeRes = await client.revokeSessions({
			fetchOptions: {
				headers: { authorization: `Bearer ${bearerToken}` },
				onSuccess(context) {
					setCookieHeader = context.response.headers.get("set-cookie") || "";
				},
			},
		});
		expect(revokeRes.data?.status).toBe(true);

		const responseCookies = parseSetCookieHeader(setCookieHeader);
		expect(responseCookies.has("better-auth.session_token")).toBe(false);
		expect(
			responseCookies.get("better-auth.session_data")?.["max-age"],
		).not.toBe(0);
	});
});
