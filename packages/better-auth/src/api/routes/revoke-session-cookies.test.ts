import { describe, expect, it } from "vitest";
import { parseSetCookieHeader } from "../../cookies";
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
		// the caller's session token must not be expired
		expect(
			responseCookies.get("better-auth.session_token")?.["max-age"],
		).not.toBe(0);
		// and neither must the caller's cookie cache
		expect(
			responseCookies.get("better-auth.session_data")?.["max-age"],
		).not.toBe(0);

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
});
