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
			const headers = vi.fn(async () => new Headers());
			vi.doMock(import("next/headers.js"), () => ({
				headers,
			}));
			return headers;
		}

		it("should reuse the import between requests", async () => {
			const firstHeaders = mockNextHeaders();
			const [{ getTestInstance }, { nextCookies }] = await Promise.all([
				import("../test-utils/test-instance"),
				import("./next-js"),
			]);
			const { auth } = await getTestInstance(
				{ plugins: [nextCookies()] },
				{ disableTestUser: true },
			);

			await auth.api.getSession({ headers: new Headers() });

			vi.resetModules();
			vi.doUnmock(import("next/headers.js"));
			const secondHeaders = mockNextHeaders();

			await auth.api.getSession({ headers: new Headers() });

			expect(firstHeaders).toHaveBeenCalledTimes(2);
			expect(secondHeaders).not.toHaveBeenCalled();
		});

		it("should retry after a failed import", async () => {
			const failedImport = vi.fn(() => {
				throw new Error("transient next/headers import failure");
			});
			vi.doMock(import("next/headers.js"), failedImport);
			const [{ getTestInstance }, { nextCookies }] = await Promise.all([
				import("../test-utils/test-instance"),
				import("./next-js"),
			]);
			const { auth } = await getTestInstance(
				{ plugins: [nextCookies()] },
				{ disableTestUser: true },
			);

			await auth.api.getSession({ headers: new Headers() });
			expect(failedImport).toHaveBeenCalledOnce();

			vi.resetModules();
			vi.doUnmock(import("next/headers.js"));
			const headersMock = mockNextHeaders();

			await auth.api.getSession({ headers: new Headers() });

			expect(headersMock).toHaveBeenCalledOnce();
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11910
	 */
	describe("toNextJsHandler with a Next.js basePath", () => {
		afterEach(() => {
			vi.unstubAllEnvs();
		});

		async function getAuth(basePath = "/dev/api/auth") {
			const [{ getTestInstance }, nextJs] = await Promise.all([
				import("../test-utils/test-instance"),
				import("./next-js"),
			]);
			const instance = await getTestInstance({ basePath });
			return { ...instance, toNextJsHandler: nextJs.toNextJsHandler };
		}

		it("should restore the basePath that Next.js strips from route handler URLs", async () => {
			const { auth, toNextJsHandler } = await getAuth();
			const { GET } = toNextJsHandler(auth, { basePath: "/dev" });

			const res = await GET(
				new Request("http://localhost:3000/api/auth/get-session"),
			);

			expect(res.status).toBe(200);
			expect(await res.json()).toBeNull();
		});

		it("should read the basePath that Next.js injects at build time", async () => {
			vi.stubEnv("__NEXT_ROUTER_BASEPATH", "/dev");
			const { auth, toNextJsHandler } = await getAuth();
			const { GET } = toNextJsHandler(auth);

			const res = await GET(
				new Request("http://localhost:3000/api/auth/get-session"),
			);

			expect(res.status).toBe(200);
		});

		it("should not add the basePath twice when the URL already has it", async () => {
			const { auth, toNextJsHandler } = await getAuth();
			const handler = vi.fn(auth.handler);
			const { GET } = toNextJsHandler(
				{ ...auth, handler },
				{ basePath: "/dev" },
			);

			const res = await GET(
				new Request("http://localhost:3000/dev/api/auth/get-session"),
			);

			expect(res.status).toBe(200);
			expect(new URL(handler.mock.calls[0]![0].url).pathname).toBe(
				"/dev/api/auth/get-session",
			);
		});

		it("should keep working when the auth basePath omits the Next.js basePath", async () => {
			const { auth, toNextJsHandler } = await getAuth("/api/auth");
			const handler = vi.fn(auth.handler);
			const { GET } = toNextJsHandler(
				{ ...auth, handler },
				{ basePath: "/dev" },
			);

			const res = await GET(
				new Request("http://localhost:3000/api/auth/get-session"),
			);

			expect(res.status).toBe(200);
			expect(new URL(handler.mock.calls[0]![0].url).pathname).toBe(
				"/api/auth/get-session",
			);
		});

		it("should preserve the method, body, headers and query", async () => {
			const { auth, testUser, toNextJsHandler } = await getAuth();
			const handler = vi.fn(auth.handler);
			const { POST } = toNextJsHandler(
				{ ...auth, handler },
				{ basePath: "/dev" },
			);

			const res = await POST(
				new Request("http://localhost:3000/api/auth/sign-in/email?foo=bar", {
					method: "POST",
					headers: {
						"content-type": "application/json",
						origin: "http://localhost:3000",
					},
					body: JSON.stringify({
						email: testUser.email,
						password: testUser.password,
					}),
				}),
			);

			expect(res.status).toBe(200);
			expect(res.headers.get("set-cookie")).toContain(
				"better-auth.session_token",
			);
			expect(handler.mock.calls[0]![0].url).toBe(
				"http://localhost:3000/dev/api/auth/sign-in/email?foo=bar",
			);
		});
	});
});
