import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { parseSetCookieHeader } from "../../cookies";
import { getDate } from "../../utils/date";
import { memoryAdapter, type MemoryDB } from "../../adapters/memory-adapter";
import { createHeadersWithTenantId } from "../../test-utils/headers";

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
				onSuccess(context) {
					const header = context.response.headers.get("set-cookie");
					const cookies = parseSetCookieHeader(header || "");
					const signedCookie = cookies.get("better-auth.session_token")?.value;
					headers.set("cookie", `better-auth.session_token=${signedCookie}`);
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
		const { headers } = await signInWithTestUser();

		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});

		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(1000 * 60 * 5);
		const session2 = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session2.data?.session.expiresAt).not.toBe(
			session.data?.session.expiresAt,
		);
		expect(
			new Date(session2.data!.session.expiresAt).getTime(),
		).toBeGreaterThan(new Date(session.data!.session.expiresAt).getTime());
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
				onSuccess(context) {
					const header = context.response.headers.get("set-cookie");
					const cookies = parseSetCookieHeader(header || "");
					const signedCookie = cookies.get("better-auth.session_token")?.value;
					const dontRememberMe = cookies.get(
						"better-auth.dont_remember",
					)?.value;
					headers.set(
						"cookie",
						`better-auth.session_token=${signedCookie};better-auth.dont_remember=${dontRememberMe}`,
					);
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
					headers.set(
						"cookie",
						`better-auth.session_token=${
							cookies.get("better-auth.session_token")?.value
						}`,
					);
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
				onSuccess(context) {
					const header = context.response.headers.get("set-cookie");
					const cookies = parseSetCookieHeader(header || "");
					const signedCookie = cookies.get("better-auth.session_token")?.value;
					headers.set("cookie", `better-auth.session_token=${signedCookie}`);
				},
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

	it("should store session in secondary storage", async () => {
		//since the instance creates a session on init, we expect the store to have 2 item (1 for session and 1 for active sessions record for the user)
		expect(store.size).toBe(2);
		const { headers } = await signInWithTestUser();
		expect(store.size).toBe(3);
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
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

	it("should list sessions", async () => {
		const { headers } = await signInWithTestUser();
		const response = await client.listSessions({
			fetchOptions: {
				headers,
			},
		});
		expect(response.data?.length).toBeGreaterThan(1);
	});

	it("should revoke session", async () => {
		const { headers } = await signInWithTestUser();
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data).not.toBeNull();
		const res = await client.revokeSession({
			fetchOptions: {
				headers,
			},
			token: session.data?.session?.token || "",
		});
		const revokedSession = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(revokedSession.data).toBeNull();
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
				onSuccess(context) {
					const header = context.response.headers.get("set-cookie");
					const cookies = parseSetCookieHeader(header || "");
					headers.set(
						"cookie",
						`better-auth.session_token=${
							cookies.get("better-auth.session_token")?.value
						};better-auth.session_data=${
							cookies.get("better-auth.session_data")?.value
						}`,
					);
				},
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
		await ctx.internalAdapter.updateUser(s.data?.user.id || "", {
			emailVerified: true,
		});
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
		expect(fn).toHaveBeenCalledTimes(3);
	});

	it("should reset cache when expires", async () => {
		expect(fn).toHaveBeenCalledTimes(3);
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
		expect(fn).toHaveBeenCalledTimes(5);
		await client.getSession({
			fetchOptions: {
				headers,
				onSuccess(context) {
					cookieSetter(headers)(context);
				},
			},
		});
		expect(fn).toHaveBeenCalledTimes(5);
	});
});

describe("session multi-tenancy", async () => {
	const { client, auth } = await getTestInstance(
		{
			multiTenancy: {
				enabled: true,
			},
		},
		{
			disableTestUser: true,
		},
	);

	it("should isolate sessions per tenant", async () => {
		// Create users in different tenants
		const tenant1User = await auth.api.signUpEmail({
			body: {
				email: "user1@test.com",
				password: "password",
				name: "User 1",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		const tenant2User = await auth.api.signUpEmail({
			body: {
				email: "user2@test.com",
				password: "password",
				name: "User 2",
			},
			headers: createHeadersWithTenantId("tenant-2"),
		});

		// Get sessions with correct tenant headers
		const tenant1Session = await client.getSession({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-1", {
					authorization: `Bearer ${tenant1User.token}`,
				}),
			},
		});

		const tenant2Session = await client.getSession({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-2", {
					authorization: `Bearer ${tenant2User.token}`,
				}),
			},
		});

		expect(tenant1Session.data?.user.tenantId).toBe("tenant-1");
		expect(tenant2Session.data?.user.tenantId).toBe("tenant-2");
		expect(tenant1Session.data?.user.id).not.toBe(tenant2Session.data?.user.id);
	});

	it("should fail to get session with wrong tenant ID", async () => {
		const tenantUser = await auth.api.signUpEmail({
			body: {
				email: "user@test.com",
				password: "password",
				name: "User",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		// Create session headers with cookies for tenant-1
		const headers1 = new Headers();
		await client.signIn.email(
			{
				email: "user@test.com",
				password: "password",
			},
			{
				onSuccess(context) {
					const header = context.response.headers.get("set-cookie");
					const cookies = parseSetCookieHeader(header || "");
					const signedCookie = cookies.get("better-auth.session_token")?.value;
					headers1.set("cookie", `better-auth.session_token=${signedCookie}`);
					headers1.set("x-internal-tenantid", "tenant-1");
				},
			},
		);

		// Try to get session with wrong tenant ID
		const headers2 = new Headers(headers1);
		headers2.set("x-internal-tenantid", "tenant-2");

		const wrongTenantSession = await client.getSession({
			fetchOptions: {
				headers: headers2,
			},
		});

		expect(wrongTenantSession.data).toBeNull();
	});

	it("should list sessions only for current tenant", async () => {
		// Create user in tenant-1 with multiple sessions
		const tenant1User = await auth.api.signUpEmail({
			body: {
				email: "user1@tenant1.com",
				password: "password",
				name: "User 1",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		// Sign in again to create second session for same user
		const tenant1UserSecondSession = await auth.api.signInEmail({
			body: {
				email: "user1@tenant1.com",
				password: "password",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		// Create user in tenant-2
		const tenant2User = await auth.api.signUpEmail({
			body: {
				email: "user@tenant2.com",
				password: "password",
				name: "User",
			},
			headers: createHeadersWithTenantId("tenant-2"),
		});

		// List sessions for tenant-1 user using token
		const tenant1Sessions = await client.listSessions({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-1", {
					authorization: `Bearer ${tenant1UserSecondSession.token}`,
				}),
			},
		});

		// List sessions for tenant-2 user using token
		const tenant2Sessions = await client.listSessions({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-2", {
					authorization: `Bearer ${tenant2User.token}`,
				}),
			},
		});

		// Verify tenant-1 user can see their own sessions
		expect(tenant1Sessions.data?.length).toBeGreaterThan(0);
		expect(
			tenant1Sessions.data?.every(
				(session) => session.userId === tenant1User.user.id,
			),
		).toBe(true);

		// Verify tenant-2 only sees its own session
		expect(tenant2Sessions.data?.length).toBeGreaterThan(0);
		expect(
			tenant2Sessions.data?.every(
				(session) => session.userId === tenant2User.user.id,
			),
		).toBe(true);

		// Verify sessions are not shared between tenants
		const tenant1SessionIds = tenant1Sessions.data?.map((s) => s.id) || [];
		const tenant2SessionIds = tenant2Sessions.data?.map((s) => s.id) || [];
		expect(tenant1SessionIds.some((id) => tenant2SessionIds.includes(id))).toBe(
			false,
		);
	});

	it("should revoke sessions only within tenant", async () => {
		// Create users in different tenants
		const tenant1User = await auth.api.signUpEmail({
			body: {
				email: "user1@revoke.com",
				password: "password",
				name: "User 1",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		const tenant2User = await auth.api.signUpEmail({
			body: {
				email: "user2@revoke.com",
				password: "password",
				name: "User 2",
			},
			headers: createHeadersWithTenantId("tenant-2"),
		});

		// Revoke session in tenant-1
		await client.revokeSession({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-1", {
					authorization: `Bearer ${tenant1User.token}`,
				}),
			},
			token: tenant1User.token!,
		});

		// Verify tenant-1 session is revoked
		const tenant1Session = await client.getSession({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-1", {
					authorization: `Bearer ${tenant1User.token}`,
				}),
			},
		});
		expect(tenant1Session.data).toBeNull();

		// Verify tenant-2 session is still active
		const tenant2Session = await client.getSession({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-2", {
					authorization: `Bearer ${tenant2User.token}`,
				}),
			},
		});
		expect(tenant2Session.data?.user.id).toBe(tenant2User.user.id);
	});

	it("should handle session updates per tenant", async () => {
		const { client, auth: updateAuth } = await getTestInstance(
			{
				multiTenancy: {
					enabled: true,
				},
				session: {
					updateAge: 60,
					expiresIn: 60 * 2,
				},
			},
			{
				disableTestUser: true,
			},
		);

		// Create users in different tenants
		const tenant1User = await updateAuth.api.signUpEmail({
			body: {
				email: "user1@update.com",
				password: "password",
				name: "User 1",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		const tenant2User = await updateAuth.api.signUpEmail({
			body: {
				email: "user2@update.com",
				password: "password",
				name: "User 2",
			},
			headers: createHeadersWithTenantId("tenant-2"),
		});

		// Get initial sessions
		const tenant1InitialSession = await client.getSession({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-1", {
					authorization: `Bearer ${tenant1User.token}`,
				}),
			},
		});

		const tenant2InitialSession = await client.getSession({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-2", {
					authorization: `Bearer ${tenant2User.token}`,
				}),
			},
		});

		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(1000 * 70); // Advance past update age

		// Update session for tenant-1 only
		const tenant1UpdatedSession = await client.getSession({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-1", {
					authorization: `Bearer ${tenant1User.token}`,
				}),
			},
		});

		// Verify tenant-1 session was updated
		expect(
			new Date(tenant1UpdatedSession.data!.session.expiresAt).getTime(),
		).toBeGreaterThan(
			new Date(tenant1InitialSession.data!.session.expiresAt).getTime(),
		);

		// Verify tenant-2 session is isolated and unchanged
		const tenant2Session = await client.getSession({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-2", {
					authorization: `Bearer ${tenant2User.token}`,
				}),
			},
		});

		expect(tenant2Session.data?.user.tenantId).toBe("tenant-2");
		expect(tenant2Session.data?.user.id).toBe(tenant2User.user.id);

		vi.useRealTimers();
	});
});
