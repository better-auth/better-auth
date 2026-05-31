import { afterEach, describe, expect, it, vi } from "vitest";

describe("next-js integration", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
		vi.resetModules();
		vi.doUnmock("next/headers.js");
	});

	async function getSessionWithNextHeaders(
		nextHeaders: HeadersInit | "unavailable",
	) {
		const cookiesMock = vi.fn(async () => ({
			set: vi.fn(),
			delete: vi.fn(),
			get: vi.fn(),
		}));
		const headersMock =
			nextHeaders === "unavailable"
				? vi.fn(async () => {
						throw new Error("`headers` was called outside a request scope.");
					})
				: vi.fn(async () => new Headers(nextHeaders));

		vi.doMock("next/headers.js", () => ({
			cookies:
				nextHeaders === "unavailable"
					? vi.fn(async () => {
							throw new Error("`cookies` was called outside a request scope.");
						})
					: cookiesMock,
			headers: headersMock,
		}));

		const [{ getTestInstance }, { nextCookies }] = await Promise.all([
			import("../test-utils/test-instance"),
			import("./next-js"),
		]);

		const { auth, testUser } = await getTestInstance({
			plugins: [nextCookies()],
			session: {
				deferSessionRefresh: true,
				updateAge: 0,
			},
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

		cookiesMock.mockClear();
		headersMock.mockClear();

		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(1000);

		const session = await auth.api.getSession({
			headers: requestHeaders,
		});

		return {
			cookiesMock,
			headersMock,
			session: session as { needsRefresh?: boolean } | null,
		};
	}

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8464
	 */
	it("should not probe cookies in server action context", async () => {
		const { cookiesMock, headersMock, session } =
			await getSessionWithNextHeaders({
				RSC: "1",
				"next-action": "abc123",
			});

		expect(headersMock).toHaveBeenCalledTimes(1);
		expect(cookiesMock).not.toHaveBeenCalled();
		expect(session).not.toBeNull();
		expect(session?.needsRefresh).toBe(true);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8464
	 */
	it("should skip refresh in server component context", async () => {
		const { cookiesMock, headersMock, session } =
			await getSessionWithNextHeaders({ RSC: "1" });

		expect(headersMock).toHaveBeenCalledTimes(1);
		expect(cookiesMock).not.toHaveBeenCalled();
		expect(session).not.toBeNull();
		expect(session?.needsRefresh).toBe(false);
	});

	it("should allow refresh in route handler context", async () => {
		const { cookiesMock, session } = await getSessionWithNextHeaders({});

		expect(cookiesMock).not.toHaveBeenCalled();
		expect(session).not.toBeNull();
		expect(session?.needsRefresh).toBe(true);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8828
	 */
	it("should not leak __better-auth-cookie-store cookie", async () => {
		vi.doMock("next/headers.js", () => ({
			cookies: vi.fn(async () => ({
				set: vi.fn(),
				delete: vi.fn(),
				get: vi.fn(),
			})),
			headers: vi.fn(async () => new Headers({ RSC: "1" })),
		}));

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

	it("should handle unavailable headers gracefully", async () => {
		const { session } = await getSessionWithNextHeaders("unavailable");

		expect(session).not.toBeNull();
	});

	/**
	 * When Next.js middleware is present (even a pass-through `NextResponse.next()`),
	 * it strips internal routing headers (RSC, next-action, etc.) before forwarding
	 * to the app router. The nextCookiesMiddleware() helper maps them to custom
	 * x-better-auth-* headers that survive the middleware→app transition.
	 *
	 * @see https://github.com/better-auth/better-auth/issues/9776
	 */
	it("should skip refresh when x-better-auth-is-rsc header is set (middleware scenario)", async () => {
		// Simulates a request that went through nextCookiesMiddleware():
		// RSC header was stripped by Next.js but x-better-auth-is-rsc was forwarded.
		const { cookiesMock, headersMock, session } =
			await getSessionWithNextHeaders({
				"x-better-auth-is-rsc": "1",
			});

		expect(headersMock).toHaveBeenCalledTimes(1);
		expect(cookiesMock).not.toHaveBeenCalled();
		expect(session).not.toBeNull();
		expect(session?.needsRefresh).toBe(false);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9776
	 */
	it("should not skip refresh when x-better-auth-is-server-action is set (middleware + server action scenario)", async () => {
		const { session } = await getSessionWithNextHeaders({
			"x-better-auth-is-rsc": "1",
			"x-better-auth-is-server-action": "1",
		});

		expect(session).not.toBeNull();
		expect(session?.needsRefresh).toBe(true);
	});

	describe("nextCookiesMiddleware", () => {
		it("should map RSC header to x-better-auth-is-rsc", async () => {
			const { nextCookiesMiddleware } = await import("./next-js");
			const request = { headers: new Headers({ RSC: "1" }) };
			const result = nextCookiesMiddleware(request);
			expect(result.request.headers.get("x-better-auth-is-rsc")).toBe("1");
		});

		it("should map next-action header to x-better-auth-is-server-action", async () => {
			const { nextCookiesMiddleware } = await import("./next-js");
			const request = {
				headers: new Headers({ RSC: "1", "next-action": "abc123" }),
			};
			const result = nextCookiesMiddleware(request);
			expect(result.request.headers.get("x-better-auth-is-rsc")).toBe("1");
			expect(result.request.headers.get("x-better-auth-is-server-action")).toBe(
				"1",
			);
		});

		it("should not set custom headers when RSC headers are absent", async () => {
			const { nextCookiesMiddleware } = await import("./next-js");
			const request = { headers: new Headers({}) };
			const result = nextCookiesMiddleware(request);
			expect(result.request.headers.get("x-better-auth-is-rsc")).toBeNull();
			expect(
				result.request.headers.get("x-better-auth-is-server-action"),
			).toBeNull();
		});
	});
});
