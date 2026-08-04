import { afterEach, describe, expect, it, vi } from "vitest";

describe("next-js integration", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
		vi.resetModules();
		vi.doUnmock("next/headers.js");
	});

	async function callDueSession(operation: "read" | "refresh") {
		const cookieSet = vi.fn();
		const cookies = vi.fn(async () => ({
			set: cookieSet,
			delete: vi.fn(),
			get: vi.fn(),
		}));

		vi.doMock("next/headers.js", () => ({
			cookies,
		}));

		const [{ getTestInstance }, { nextCookies }] = await Promise.all([
			import("../test-utils/test-instance"),
			import("./next-js"),
		]);

		const { auth, testUser } = await getTestInstance({
			plugins: [nextCookies()],
			session: {
				updateAge: 0,
			},
		});
		const ctx = await auth.$context;
		const updateSession = vi.spyOn(ctx.internalAdapter, "updateSession");

		const signInRes = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			returnHeaders: true,
		});
		const requestHeaders = new Headers();
		requestHeaders.set("cookie", signInRes.headers.getSetCookie()[0]!);

		cookies.mockClear();
		cookieSet.mockClear();

		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(1000);

		const session =
			operation === "read"
				? await auth.api.getSession({ headers: requestHeaders })
				: await auth.api.refreshSession({ headers: requestHeaders });

		return {
			cookieSet,
			cookies,
			session,
			updateSession,
		};
	}

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9776
	 */
	it("should keep direct session reads side-effect free", async () => {
		const { cookieSet, session, updateSession } = await callDueSession("read");

		expect(updateSession).not.toHaveBeenCalled();
		expect(cookieSet).not.toHaveBeenCalled();
		expect(session).not.toBeNull();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9776
	 */
	it("should write refreshed cookies only for explicit refreshes", async () => {
		const { cookieSet, session, updateSession } =
			await callDueSession("refresh");

		expect(updateSession).toHaveBeenCalledOnce();
		expect(cookieSet).toHaveBeenCalled();
		expect(session).not.toBeNull();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8828
	 */
	it("should not leak __better-auth-cookie-store cookie", async () => {
		const [{ getTestInstance }, { nextCookies }] = await Promise.all([
			import("../test-utils/test-instance"),
			import("./next-js"),
		]);

		const { auth, testUser } = await getTestInstance({
			plugins: [nextCookies()],
		});

		const signInRes = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			returnHeaders: true,
		});
		const requestHeaders = new Headers();
		requestHeaders.set("cookie", signInRes.headers.getSetCookie()[0]!);

		const res = await auth.handler(
			new Request("http://localhost:3000/api/auth/get-session", {
				headers: requestHeaders,
			}),
		);

		const setCookies = res.headers.getSetCookie();
		const hasProbeCookie = setCookies.some((c) =>
			c.includes("__better-auth-cookie-store"),
		);
		expect(hasProbeCookie).toBe(false);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9705
	 */
	it("should forward every set-cookie header to next cookies()", async () => {
		const cookieSet = vi.fn();
		vi.doMock("next/headers.js", () => ({
			cookies: vi.fn(async () => ({
				set: cookieSet,
				delete: vi.fn(),
				get: vi.fn(),
			})),
			headers: vi.fn(async () => new Headers()),
		}));

		const [{ getTestInstance }, { nextCookies }] = await Promise.all([
			import("../test-utils/test-instance"),
			import("./next-js"),
		]);

		const { auth, testUser } = await getTestInstance({
			plugins: [nextCookies()],
			session: {
				cookieCache: {
					enabled: true,
					maxAge: 600,
				},
			},
		});
		// drop the forwarding recorded for the test-user sign-up
		cookieSet.mockClear();

		const { headers } = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			returnHeaders: true,
		});

		// cookieCache makes sign-in emit two set-cookie headers on one response
		const setCookieNames = headers
			.getSetCookie()
			.map((cookie) => cookie.split("=")[0]!);
		expect(setCookieNames).toEqual([
			"better-auth.session_token",
			"better-auth.session_data",
		]);

		expect(cookieSet.mock.calls.map(([name]) => name)).toEqual(setCookieNames);
		const sessionDataCall = cookieSet.mock.calls.find(
			([name]) => name === "better-auth.session_data",
		);
		expect(sessionDataCall?.[2]).toMatchObject({ maxAge: 600 });
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10466
	 */
	describe("next/headers module loading", () => {
		function mockNextHeaders() {
			const cookies = vi.fn(async () => ({
				set: vi.fn(),
				delete: vi.fn(),
				get: vi.fn(),
			}));
			vi.doMock("next/headers.js", () => ({
				cookies,
			}));
			return cookies;
		}

		it("should reuse the import between requests", async () => {
			const firstCookies = mockNextHeaders();
			const [{ getTestInstance }, { nextCookies }] = await Promise.all([
				import("../test-utils/test-instance"),
				import("./next-js"),
			]);
			const { auth, testUser } = await getTestInstance({
				plugins: [nextCookies()],
			});
			const callsAfterSetup = firstCookies.mock.calls.length;
			expect(callsAfterSetup).toBeGreaterThan(0);

			vi.resetModules();
			vi.doUnmock("next/headers.js");
			const secondCookies = mockNextHeaders();

			await auth.api.signInEmail({
				body: {
					email: testUser.email,
					password: testUser.password,
				},
			});

			expect(firstCookies).toHaveBeenCalledTimes(callsAfterSetup + 1);
			expect(secondCookies).not.toHaveBeenCalled();
		});

		it("should retry after a failed import", async () => {
			const failedImport = vi.fn(() => {
				throw new Error("Cannot find module 'next/headers.js'");
			});
			vi.doMock("next/headers.js", failedImport);
			const [{ getTestInstance }, { nextCookies }] = await Promise.all([
				import("../test-utils/test-instance"),
				import("./next-js"),
			]);
			const { auth, testUser } = await getTestInstance(
				{ plugins: [nextCookies()] },
				{ disableTestUser: true },
			);

			await expect(
				auth.api.signUpEmail({
					body: {
						email: testUser.email,
						name: testUser.name,
						password: testUser.password,
					},
				}),
			).rejects.toThrow("There was an error when mocking a module");
			expect(failedImport).toHaveBeenCalledOnce();

			vi.resetModules();
			vi.doUnmock("next/headers.js");
			const cookiesMock = mockNextHeaders();

			await auth.api.signInEmail({
				body: {
					email: testUser.email,
					password: testUser.password,
				},
			});

			expect(cookiesMock).toHaveBeenCalledOnce();
		});
	});
});
