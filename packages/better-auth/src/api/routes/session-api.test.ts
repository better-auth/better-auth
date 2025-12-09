import type { GenericEndpointContext } from "@better-auth/core";
import { runWithEndpointContext } from "@better-auth/core/context";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { MemoryDB } from "../../adapters/memory-adapter";
import { memoryAdapter } from "../../adapters/memory-adapter";
import { parseCookies, parseSetCookieHeader } from "../../cookies";
import { signJWT, verifyJWT } from "../../crypto";
import { getTestInstance } from "../../test-utils/test-instance";
import { getDate } from "../../utils/date";

describe("session", async () => {
	const { client, testUser, sessionSetter, cookieSetter, auth } =
		await getTestInstance();

	it("should set cookies correctly on sign in", async () => {
		const headers = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess(context) {
					const header = context.response.headers.get("set-cookie");
					const cookies = parseSetCookieHeader(header || "");
					cookieSetter(headers)(context);
					const cookie = cookies.get("better-auth.session_token");
					expect(cookie).toMatchObject({
						value: expect.any(String),
						"max-age": 60 * 60 * 24 * 7,
						path: "/",
						samesite: "lax",
						httponly: true,
					});
				},
			},
		);
		const { data } = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		const expiresAt = new Date(data?.session.expiresAt || "");
		const now = new Date();

		expect(expiresAt.getTime()).toBeGreaterThan(
			now.getTime() + 6 * 24 * 60 * 60 * 1000,
		);
	});

	it("should return null when not authenticated", async () => {
		const response = await client.getSession();
		expect(response.data).toBeNull();
	});

	it("should update session when update age is reached", async () => {
		const { client, testUser } = await getTestInstance({
			session: {
				updateAge: 60,
				expiresIn: 60 * 2,
			},
		});
		let headers = new Headers();

		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);

		const data = await client.getSession({
			fetchOptions: {
				headers,
				throw: true,
			},
		});

		if (!data) {
			throw new Error("No session found");
		}
		expect(new Date(data?.session.expiresAt).getTime()).toBeGreaterThan(
			new Date(Date.now() + 1000 * 2 * 59).getTime(),
		);

		expect(new Date(data?.session.expiresAt).getTime()).toBeLessThan(
			new Date(Date.now() + 1000 * 2 * 60).getTime(),
		);
		for (const t of [60, 80, 100, 121]) {
			const span = new Date();
			span.setSeconds(span.getSeconds() + t);
			vi.setSystemTime(span);
			const response = await client.getSession({
				fetchOptions: {
					headers,
					onSuccess(context) {
						const parsed = parseSetCookieHeader(
							context.response.headers.get("set-cookie") || "",
						);
						const maxAge = parsed.get("better-auth.session_token")?.["max-age"];
						expect(maxAge).toBe(t === 121 ? 0 : 60 * 2);
					},
				},
			});
			if (t === 121) {
				//expired
				expect(response.data).toBeNull();
			} else {
				expect(
					new Date(response.data?.session.expiresAt!).getTime(),
				).toBeGreaterThan(new Date(Date.now() + 1000 * 2 * 59).getTime());
			}
		}
		vi.useRealTimers();
	});

	it("should update the session every time when set to 0", async () => {
		const { client, signInWithTestUser } = await getTestInstance({
			session: {
				updateAge: 0,
			},
		});
		const { runWithUser } = await signInWithTestUser();

		await runWithUser(async () => {
			const session = await client.getSession();

			vi.useFakeTimers();
			await vi.advanceTimersByTimeAsync(1000 * 60 * 5);
			const session2 = await client.getSession();
			expect(session2.data?.session.expiresAt).not.toBe(
				session.data?.session.expiresAt,
			);
			expect(
				new Date(session2.data!.session.expiresAt).getTime(),
			).toBeGreaterThan(new Date(session.data!.session.expiresAt).getTime());
		});
	});

	it("should handle 'don't remember me' option", async () => {
		let headers = new Headers();
		const res = await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
				rememberMe: false,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);
		const data = await client.getSession({
			fetchOptions: {
				headers,
				throw: true,
			},
		});
		if (!data) {
			throw new Error("No session found");
		}
		const expiresAt = data.session.expiresAt;
		expect(new Date(expiresAt).valueOf()).toBeLessThanOrEqual(
			getDate(1000 * 60 * 60 * 24).valueOf(),
		);
		const response = await client.getSession({
			fetchOptions: {
				headers,
			},
		});

		if (!response.data?.session) {
			throw new Error("No session found");
		}
		// Check that the session wasn't update
		expect(
			new Date(response.data.session.expiresAt).valueOf(),
		).toBeLessThanOrEqual(getDate(1000 * 60 * 60 * 24).valueOf());
	});

	it("should set cookies correctly on sign in after changing config", async () => {
		const headers = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess(context) {
					const header = context.response.headers.get("set-cookie");
					const cookies = parseSetCookieHeader(header || "");
					expect(cookies.get("better-auth.session_token")).toMatchObject({
						value: expect.any(String),
						"max-age": 60 * 60 * 24 * 7,
						path: "/",
						httponly: true,
						samesite: "lax",
					});
					cookieSetter(headers)(context);
				},
			},
		);
		const data = await client.getSession({
			fetchOptions: {
				headers,
				throw: true,
			},
		});
		if (!data) {
			throw new Error("No session found");
		}
		const expiresAt = new Date(data?.session?.expiresAt || "");
		const now = new Date();

		expect(expiresAt.getTime()).toBeGreaterThan(
			now.getTime() + 6 * 24 * 60 * 60 * 1000,
		);
	});

	it("should clear session on sign out", async () => {
		let headers = new Headers();
		const res = await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);
		const data = await client.getSession({
			fetchOptions: {
				headers,
				throw: true,
			},
		});

		expect(data).not.toBeNull();
		await client.signOut({
			fetchOptions: {
				headers,
			},
		});
		const response = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(response.data);
	});

	it("should list sessions", async () => {
		const headers = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);

		const response = await client.listSessions({
			fetchOptions: {
				headers,
			},
		});

		expect(response.data?.length).toBeGreaterThan(1);
	});

	it("should revoke session", async () => {
		const headers = new Headers();
		const headers2 = new Headers();
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				onSuccess: sessionSetter(headers),
			},
		});
		await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				onSuccess: sessionSetter(headers2),
			},
		});
		const session = await client.getSession({
			fetchOptions: {
				headers,
				throw: true,
			},
		});
		await client.revokeSession({
			fetchOptions: {
				headers,
			},
			token: session?.session?.token || "",
		});
		const newSession = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(newSession.data).toBeNull();
		const revokeRes = await client.revokeSessions({
			fetchOptions: {
				headers: headers2,
			},
		});
		expect(revokeRes.data?.status).toBe(true);
	});

	it("should return session headers", async () => {
		const context = await auth.$context;
		await runWithEndpointContext(
			{
				context,
			} as unknown as GenericEndpointContext,
			async () => {
				const signInRes = await auth.api.signInEmail({
					body: {
						email: testUser.email,
						password: testUser.password,
					},
					returnHeaders: true,
				});

				const signInHeaders = new Headers();
				signInHeaders.set("cookie", signInRes.headers.getSetCookie()[0]!);

				const sessionResWithoutHeaders = await auth.api.getSession({
					headers: signInHeaders,
				});

				const sessionResWithHeaders = await auth.api.getSession({
					headers: signInHeaders,
					returnHeaders: true,
				});

				expect(sessionResWithHeaders.headers).toBeDefined();
				expect(sessionResWithHeaders.response?.user).toBeDefined();
				expect(sessionResWithHeaders.response?.session).toBeDefined();
				expectTypeOf({
					headers: sessionResWithHeaders.headers,
				}).toMatchObjectType<{
					headers: Headers;
				}>();

				// @ts-expect-error: headers should not exist on sessionResWithoutHeaders
				expect(sessionResWithoutHeaders.headers).toBeUndefined();

				const sessionResWithHeadersAndAsResponse = await auth.api.getSession({
					headers: signInHeaders,
					returnHeaders: true,
					asResponse: true,
				});

				expectTypeOf({
					res: sessionResWithHeadersAndAsResponse,
				}).toMatchObjectType<{ res: Response }>();

				expect(sessionResWithHeadersAndAsResponse.ok).toBe(true);
				expect(sessionResWithHeadersAndAsResponse.status).toBe(200);
			},
		);
	});
});

describe("session storage", async () => {
	let store = new Map<string, string>();
	const { client, signInWithTestUser, db } = await getTestInstance({
		secondaryStorage: {
			set(key, value, ttl) {
				store.set(key, value);
			},
			get(key) {
				return store.get(key) || null;
			},
			delete(key) {
				store.delete(key);
			},
		},
		rateLimit: {
			enabled: false,
		},
	});

	beforeEach(() => {
		store.clear();
	});

	it("should store session in secondary storage", async () => {
		//since the instance creates a session on init, we expect the store to have 2 item (1 for session and 1 for active sessions record for the user)
		expect(store.size).toBe(0);
		const { runWithUser } = await signInWithTestUser();
		expect(store.size).toBe(2);
		await runWithUser(async () => {
			const session = await client.getSession();
			expect(session.data).toMatchObject({
				session: {
					userId: expect.any(String),
					token: expect.any(String),
					expiresAt: expect.any(Date),
					ipAddress: expect.any(String),
					userAgent: expect.any(String),
				},
				user: {
					id: expect.any(String),
					name: "test user",
					email: "test@test.com",
					emailVerified: false,
					image: null,
					createdAt: expect.any(Date),
					updatedAt: expect.any(Date),
				},
			});
		});
	});

	it("should list sessions", async () => {
		const { runWithUser } = await signInWithTestUser();
		await runWithUser(async () => {
			const response = await client.listSessions();
			expect(response.data?.length).toBe(1);
		});
	});

	it("revoke session and list sessions", async () => {
		const { runWithUser } = await signInWithTestUser();
		await runWithUser(async () => {
			const session = await client.getSession();
			expect(session.data).not.toBeNull();
			expect(session.data?.session?.token).toBeDefined();
			const userId = session.data!.session.userId;
			const sessions = JSON.parse(store.get(`active-sessions-${userId}`)!);
			expect(sessions.length).toBe(1);
			const res = await client.revokeSession({
				token: session.data?.session?.token!,
			});
			expect(res.data?.status).toBe(true);
			const response = await client.listSessions();
			expect(response.data).toBe(null);
			expect(store.size).toBe(0);
		});
	});

	it("should revoke session", async () => {
		const { runWithUser } = await signInWithTestUser();
		await runWithUser(async () => {
			const session = await client.getSession();
			expect(session.data).not.toBeNull();
			const res = await client.revokeSession({
				token: session.data?.session?.token || "",
			});
			const revokedSession = await client.getSession();
			expect(revokedSession.data).toBeNull();
		});
	});
});

describe("cookie cache", async () => {
	const database: MemoryDB = {
		user: [],
		account: [],
		session: [],
		verification: [],
	};
	const adapter = memoryAdapter(database);

	const { client, testUser, auth, cookieSetter } = await getTestInstance({
		database: adapter,
		session: {
			additionalFields: {
				sensitiveData: {
					type: "string",
					returned: false,
					defaultValue: "sensitive-data",
				},
			},
			cookieCache: {
				enabled: true,
				strategy: "compact",
				refreshCache: false,
			},
		},
	});
	const ctx = await auth.$context;

	it("should cache cookies", async () => {});
	const fn = vi.spyOn(ctx.adapter, "findOne");

	const headers = new Headers();
	it("should cache cookies", async () => {
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);
		expect(fn).toHaveBeenCalledTimes(1);
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.session).not.toHaveProperty("sensitiveData");
		expect(session.data).not.toBeNull();
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("should disable cookie cache", async () => {
		const ctx = await auth.$context;

		const s = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(s.data?.user.emailVerified).toBe(false);
		await runWithEndpointContext(
			{
				context: ctx,
			} as unknown as GenericEndpointContext,
			async () => {
				await ctx.internalAdapter.updateUser(s.data?.user.id || "", {
					emailVerified: true,
				});
			},
		);
		expect(fn).toHaveBeenCalledTimes(1);

		const session = await client.getSession({
			query: {
				disableCookieCache: true,
			},
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.user.emailVerified).toBe(true);
		expect(session.data).not.toBeNull();
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it("should reset cache when expires", async () => {
		expect(fn).toHaveBeenCalledTimes(2);
		await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(1000 * 60 * 10); // 10 minutes
		await client.getSession({
			fetchOptions: {
				headers,
				onSuccess(context) {
					cookieSetter(headers)(context);
				},
			},
		});
		expect(fn).toHaveBeenCalledTimes(3);
		await client.getSession({
			fetchOptions: {
				headers,
				onSuccess(context) {
					cookieSetter(headers)(context);
				},
			},
		});
		expect(fn).toHaveBeenCalledTimes(3);
	});
});

describe("cookie cache with JWT strategy", async () => {
	const { auth, client, testUser, cookieSetter } = await getTestInstance({
		session: {
			additionalFields: {
				sensitiveData: {
					type: "string",
					returned: false,
					defaultValue: "sensitive-data",
				},
			},
			cookieCache: {
				enabled: true,
				strategy: "jwt",
				refreshCache: false,
			},
		},
	});
	const ctx = await auth.$context;

	const fn = vi.spyOn(ctx.adapter, "findOne");

	const headers = new Headers();
	it("should cache cookies with JWT strategy", async () => {
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);
		expect(fn).toHaveBeenCalledTimes(1);
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		const jwt = parseCookies(headers.get("cookie") || "").get(
			"better-auth.session_data",
		);
		if (!jwt) {
			throw new Error("JWT not found");
		}
		const payload = await verifyJWT(jwt, ctx.secret);
		expect(payload).not.toBeNull();
		expect(session.data?.session).not.toHaveProperty("sensitiveData");
		expect(session.data).not.toBeNull();
		expect(fn).toHaveBeenCalledTimes(1); // Should still be 1 (cache hit)
	});

	it("should not allow tampering with the cookie", async () => {
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);
		const jwt = parseCookies(headers.get("cookie") || "").get(
			"better-auth.session_data",
		);
		if (!jwt) {
			throw new Error("JWT not found");
		}
		const payload = await verifyJWT(jwt, ctx.secret);
		const newJWT = await signJWT(
			{
				session: payload.session,
				user: {
					...payload.user,
					id: "tampered-id",
				},
			},
			"tampered-secret",
		);
		const sessionCookie = parseCookies(headers.get("cookie") || "").get(
			"better-auth.session_token",
		);
		if (!sessionCookie) {
			throw new Error("Session cookie not found");
		}
		headers.set("cookie", `better-auth.session_data=${newJWT}`);
		headers.append("cookie", `better-auth.session_token=${sessionCookie}`);
		const res = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(res.data).toBeNull();
	});

	it("should have max age expiry", async () => {
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);
		const jwt = parseCookies(headers.get("cookie") || "").get(
			"better-auth.session_data",
		);
		if (!jwt) {
			throw new Error("JWT not found");
		}
		const payload = await verifyJWT(jwt, ctx.secret);
		//should be greater than 299 seconds from now - (default max age is 300 seconds)
		expect(payload.exp).toBeGreaterThan(Date.now() / 1000 + 299);
	});

	it("should handle multiple concurrent requests with JWT cache", async () => {
		vi.useRealTimers();
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

		// Make multiple concurrent requests
		const promises = Array(5)
			.fill(0)
			.map(() =>
				client.getSession({
					fetchOptions: {
						headers,
					},
				}),
			);

		const results = await Promise.all(promises);

		// All should return valid sessions
		results.forEach((result) => {
			expect(result.data).not.toBeNull();
			expect(result.data?.user.email).toBe(testUser.email);
		});
	});
});

describe("cookie cache with JWE strategy", async () => {
	const { auth, client, testUser, cookieSetter } = await getTestInstance({
		session: {
			additionalFields: {
				sensitiveData: {
					type: "string",
					returned: false,
					defaultValue: "sensitive-data",
				},
			},
			cookieCache: {
				enabled: true,
				strategy: "jwe",
				refreshCache: false,
			},
		},
	});
	const ctx = await auth.$context;

	const fn = vi.spyOn(ctx.adapter, "findOne");

	const headers = new Headers();
	it("should cache cookies with JWE strategy", async () => {
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);
		expect(fn).toHaveBeenCalledTimes(1);
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.session).not.toHaveProperty("sensitiveData");
		expect(session.data).not.toBeNull();
		expect(fn).toHaveBeenCalledTimes(1); // Should still be 1 (cache hit)
	});

	it("should disable cookie cache with JWE strategy", async () => {
		const ctx = await auth.$context;

		const s = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(s.data?.user.emailVerified).toBe(false);
		await runWithEndpointContext(
			{
				context: ctx,
			} as unknown as GenericEndpointContext,
			async () => {
				await ctx.internalAdapter.updateUser(s.data?.user.id || "", {
					emailVerified: true,
				});
			},
		);
		expect(fn).toHaveBeenCalledTimes(1);

		const session = await client.getSession({
			query: {
				disableCookieCache: true,
			},
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.user.emailVerified).toBe(true);
		expect(session.data).not.toBeNull();
		expect(fn).toHaveBeenCalledTimes(2); // Database hit when cache disabled
	});

	it("should reset JWE cache when expires", async () => {
		expect(fn).toHaveBeenCalledTimes(2);
		await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(fn).toHaveBeenCalledTimes(2);

		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(1000 * 60 * 10);

		await client.getSession({
			fetchOptions: {
				headers,
				onSuccess(context) {
					cookieSetter(headers)(context);
				},
			},
		});

		expect(fn.mock.calls.length).toBeGreaterThanOrEqual(2);

		vi.useRealTimers();
	});

	it("should handle multiple concurrent requests with JWE cache", async () => {
		vi.useRealTimers();
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

		// Make multiple concurrent requests
		const promises = Array(5)
			.fill(0)
			.map(() =>
				client.getSession({
					fetchOptions: {
						headers,
					},
				}),
			);

		const results = await Promise.all(promises);

		// All should return valid sessions
		results.forEach((result) => {
			expect(result.data).not.toBeNull();
			expect(result.data?.user.email).toBe(testUser.email);
		});
	});
});

describe("cookie cache refreshCache", async () => {
	const { auth, client, testUser, cookieSetter } = await getTestInstance({
		session: {
			cookieCache: {
				enabled: true,
				strategy: "jwe",
				maxAge: 300, // 5 minutes
				refreshCache: {
					updateAge: 60, // Refresh when 60 seconds remain
				},
			},
		},
	});
	const ctx = await auth.$context;
	const fn = vi.spyOn(ctx.adapter, "findOne");

	const headers = new Headers();

	it("should use cached data when refreshCache threshold has not been reached", async () => {
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);
		expect(fn).toHaveBeenCalledTimes(1);

		const session1 = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session1.data).not.toBeNull();
		expect(fn).toHaveBeenCalledTimes(1);

		const session2 = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session2.data).not.toBeNull();
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("should refresh cache stateless when refreshCache threshold is exceeded", async () => {
		const callsBefore = fn.mock.calls.length;

		vi.useFakeTimers();
		// Advance time by 241 seconds (300 - 60 = 240, so at 241 we're within the refresh window)
		await vi.advanceTimersByTimeAsync(1000 * 241);

		const session = await client.getSession({
			fetchOptions: {
				headers,
				onSuccess(context) {
					cookieSetter(headers)(context);
				},
			},
		});
		expect(session.data).not.toBeNull();

		// With stateless refresh, no DB call should be made (it just refreshes the cookie)
		const callsAfterRefresh = fn.mock.calls.length;
		expect(callsAfterRefresh).toBe(callsBefore); // No DB call for stateless refresh

		await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(fn).toHaveBeenCalledTimes(callsAfterRefresh);

		vi.useRealTimers();
	});

	it("should not refresh cache when refreshCache is disabled (false)", async () => {
		const {
			client,
			testUser: testUser0,
			cookieSetter,
			auth,
		} = await getTestInstance({
			session: {
				cookieCache: {
					enabled: true,
					strategy: "jwe",
					refreshCache: false, // Disabled
				},
			},
		});
		const ctx = await auth.$context;
		const fn = vi.spyOn(ctx.adapter, "findOne");

		const headers = new Headers();
		await client.signIn.email(
			{
				email: testUser0.email,
				password: testUser0.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);
		const callsAfterSignIn = fn.mock.calls.length;

		// Even after advancing time, cache should still be used (refreshCache disabled)
		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(1000 * 120); // 2 minutes

		await client.getSession({
			fetchOptions: {
				headers: headers,
			},
		});
		const callsAfterFirst = fn.mock.calls.length;
		expect(callsAfterFirst).toBe(callsAfterSignIn); // No DB call, cache used

		await client.getSession({
			fetchOptions: {
				headers: headers,
			},
		});
		const callsAfterSecond = fn.mock.calls.length;
		expect(callsAfterSecond).toBe(callsAfterSignIn); // Still no DB call, cache used

		vi.useRealTimers();
	});

	it("should work without database (session stored in cookie only)", async () => {
		// Create instance with cookieCache enabled and refreshCache disabled
		const {
			client,
			testUser: testUser0,
			cookieSetter,
			auth,
		} = await getTestInstance({
			session: {
				cookieCache: {
					enabled: true,
					strategy: "jwe",
					refreshCache: true, // Enable stateless refresh for DB-less scenarios
				},
			},
		});

		const headers = new Headers();

		// Sign in to create session cookie
		await client.signIn.email(
			{
				email: testUser0.email,
				password: testUser0.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);

		// Get the session to ensure it's in the cookie
		const firstSession = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(firstSession.data).not.toBeNull();
		const sessionToken = firstSession.data?.session?.token;

		// Clear the database session (simulating no database scenario)
		if (sessionToken) {
			const ctx = await auth.$context;
			await ctx.internalAdapter.deleteSession(sessionToken);
		}

		// getSession should still work using cookie cache only (no database lookup)
		const sessionFromCache = await client.getSession({
			fetchOptions: {
				headers,
			},
		});

		expect(sessionFromCache.data).not.toBeNull();
		expect(sessionFromCache.data?.user.email).toBe(testUser0.email);
		expect(sessionFromCache.data?.session).toBeDefined();
		expect(sessionFromCache.data?.session?.token).toBe(sessionToken);
	});

	it("should work without database when refreshCache threshold is reached", async () => {
		const { client, testUser, cookieSetter, auth } = await getTestInstance({
			session: {
				cookieCache: {
					enabled: true,
					strategy: "jwe",
					maxAge: 300, // 5 minutes
					refreshCache: {
						updateAge: 60, // Refresh when 60 seconds remain
					},
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

		const firstSession = await client.getSession({
			fetchOptions: {
				headers,
				onSuccess: cookieSetter(headers),
			},
		});
		expect(firstSession.data).not.toBeNull();
		const sessionToken = firstSession.data?.session?.token;

		const ctx = await auth.$context;
		await ctx.internalAdapter.deleteSession(sessionToken!);

		vi.useFakeTimers();
		// Advance time to trigger refresh (300 - 60 = 240, so at 241 we're in refresh window)
		await vi.advanceTimersByTimeAsync(1000 * 241);

		const sessionFromCache = await client.getSession({
			fetchOptions: {
				headers,
				onSuccess: cookieSetter(headers),
			},
		});

		// Should work with stateless refresh even without DB
		expect(sessionFromCache.data).not.toBeNull();
		expect(sessionFromCache.data?.user.email).toBe(testUser.email);
		expect(sessionFromCache.data?.session).toBeDefined();
		expect(sessionFromCache.data?.session?.token).toBe(sessionToken);

		vi.useRealTimers();
	});
});

describe("cookie cache versioning", async () => {
	it("should invalidate cookie cache when version changes (string version)", async () => {
		// Create instance with version "1"
		const {
			client: client1,
			testUser: testUser1,
			cookieSetter: cookieSetter1,
			auth: auth1,
		} = await getTestInstance({
			session: {
				cookieCache: {
					enabled: true,
					strategy: "jwe",
					version: "1",
				},
			},
		});

		const headers1 = new Headers();
		await client1.signIn.email(
			{
				email: testUser1.email,
				password: testUser1.password,
			},
			{
				onSuccess: cookieSetter1(headers1),
			},
		);

		// Get session with version "1" - should work
		const session1 = await client1.getSession({
			fetchOptions: {
				headers: headers1,
			},
		});
		expect(session1.data).not.toBeNull();
		expect(session1.data?.user.email).toBe(testUser1.email);

		// Create new instance with version "2" using same cookies
		const { client: client2, cookieSetter: cookieSetter2 } =
			await getTestInstance({
				session: {
					cookieCache: {
						enabled: true,
						strategy: "jwe",
						version: "2",
					},
				},
			});

		// Try to get session with old cookies but new version - should invalidate cache
		const session2 = await client2.getSession({
			fetchOptions: {
				headers: headers1,
			},
		});
		// Should return null because version mismatch invalidates the cache
		// and there's no valid session in the database for this new instance
		expect(session2.data).toBeNull();
	});

	it("should work with function-based version", async () => {
		const { client, testUser, cookieSetter } = await getTestInstance({
			session: {
				cookieCache: {
					enabled: true,
					strategy: "jwe",
					version: (session, user) => {
						// Version based on user email
						return user.email.includes("test") ? "test-v1" : "prod-v1";
					},
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

		// Get session - should work with function-based version
		const session = await client.getSession({
			fetchOptions: {
				headers,
				onSuccess: cookieSetter(headers),
			},
		});
		expect(session.data).not.toBeNull();
		expect(session.data?.user.email).toBe(testUser.email);
	});

	it("should work with async function-based version", async () => {
		const { client, testUser, cookieSetter } = await getTestInstance({
			session: {
				cookieCache: {
					enabled: true,
					strategy: "jwe",
					version: async (session, user) => {
						// Simulate async operation
						await new Promise((resolve) => setTimeout(resolve, 10));
						return `async-${user.id.slice(0, 8)}`;
					},
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

		// Get session - should work with async function-based version
		const session = await client.getSession({
			fetchOptions: {
				headers,
				onSuccess: cookieSetter(headers),
			},
		});
		expect(session.data).not.toBeNull();
		expect(session.data?.user.email).toBe(testUser.email);
	});

	it("should work with compact strategy", async () => {
		const { client, testUser, cookieSetter } = await getTestInstance({
			session: {
				cookieCache: {
					enabled: true,
					strategy: "compact",
					version: "compact-v1",
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

		const session = await client.getSession({
			fetchOptions: {
				headers,
				onSuccess: cookieSetter(headers),
			},
		});
		expect(session.data).not.toBeNull();
		expect(session.data?.user.email).toBe(testUser.email);
	});

	it("should work with jwt strategy", async () => {
		const { client, testUser, cookieSetter } = await getTestInstance({
			session: {
				cookieCache: {
					enabled: true,
					strategy: "jwt",
					version: "jwt-v1",
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

		const session = await client.getSession({
			fetchOptions: {
				headers,
				onSuccess: cookieSetter(headers),
			},
		});
		expect(session.data).not.toBeNull();
		expect(session.data?.user.email).toBe(testUser.email);
	});

	it("should default to version '1' when not specified", async () => {
		const { client, testUser, cookieSetter } = await getTestInstance({
			session: {
				cookieCache: {
					enabled: true,
					strategy: "jwe",
					// No version specified - should default to "1"
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

		const session = await client.getSession({
			fetchOptions: {
				headers,
				onSuccess: cookieSetter(headers),
			},
		});
		expect(session.data).not.toBeNull();
		expect(session.data?.user.email).toBe(testUser.email);
	});

	it("should include additionalFields when retrieving from cookie cache", async () => {
		const { client, testUser, cookieSetter, auth } = await getTestInstance({
			session: {
				additionalFields: {
					role: {
						type: "string",
						defaultValue: "user",
						returned: true, // Should be included
					},
					preferences: {
						type: "json",
						defaultValue: "{}",
						returned: true,
					},
				},
				cookieCache: {
					enabled: true,
					strategy: "compact",
				},
			},
		});

		const ctx = await auth.$context;
		const fn = vi.spyOn(ctx.adapter, "findOne");

		const headers = new Headers();

		// Sign in
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);

		// First call - should hit database
		const firstCall = fn.mock.calls.length;
		const session1 = await client.getSession({
			fetchOptions: {
				headers,
			},
		});

		expect(session1.data).toBeTruthy();
		expect(session1.data?.session).toHaveProperty("role"); // ? Should have additionalFields
		expect(session1.data?.session).toHaveProperty("preferences"); // ? Should have additionalFields

		// Second call - should use cookie cache (no DB call)
		const session2 = await client.getSession({
			fetchOptions: {
				headers,
			},
		});

		// Verify cache was used (no additional DB calls)
		expect(fn.mock.calls.length).toBe(firstCall);

		// ? THIS IS THE KEY TEST - additionalFields should be present from cache
		expect(session2.data?.session).toHaveProperty("role");
		expect(session2.data?.session).toHaveProperty("preferences");

		// Verify values match
		const s1 = session1.data?.session as Record<string, any>;
		const s2 = session2.data?.session as Record<string, any>;
		expect(s2.role).toBe(s1.role);
	});
});
