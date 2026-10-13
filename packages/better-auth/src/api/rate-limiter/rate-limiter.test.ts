import type { RateLimit } from "@better-auth/core/db";
import { normalizeIP } from "@better-auth/core/utils/ip";
import type { RateLimitStorage } from "@better-auth/rate-limit";
import {
	createMemoryRateLimitStorage,
	fixedWindow,
	parseRateLimitState,
	serializeRateLimitState,
	tokenBucket,
} from "@better-auth/rate-limit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";

const requestStorageKey = (scope: string, key: string) =>
	`rate-limit:v1:${JSON.stringify(["better-auth.request", scope, key])}`;

function createObservedStorage(): {
	storage: RateLimitStorage;
	consume: ReturnType<typeof vi.fn<RateLimitStorage["consume"]>>;
} {
	const memory = createMemoryRateLimitStorage();
	const consume = vi.fn<RateLimitStorage["consume"]>((...args) =>
		memory.consume(...args),
	);
	return { storage: { consume }, consume };
}

describe("request rate limiting", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11463
	 */
	it("returns JSON error responses", async () => {
		const { auth } = await getTestInstance(
			{
				rateLimit: {
					enabled: true,
					policy: fixedWindow({ limit: 1, windowMs: 10_000 }),
				},
			},
			{ disableTestUser: true },
		);
		const request = () =>
			new Request("http://localhost:3000/api/auth/get-session", {
				headers: { "x-forwarded-for": "203.0.113.114" },
			});

		expect((await auth.handler(request())).status).toBe(200);
		const limited = await auth.handler(request());

		expect(limited.status).toBe(429);
		expect(limited.headers.get("content-type")).toBe("application/json");
		expect(limited.headers.get("retry-after")).toBeTruthy();
		expect(await limited.json()).toEqual({
			message: "Too many requests. Please try again later.",
		});
	});

	it("applies the stricter built-in policy to authentication endpoints", async () => {
		const { client, testUser } = await getTestInstance({
			rateLimit: {
				enabled: true,
				policy: fixedWindow({ limit: 20, windowMs: 10_000 }),
			},
		});

		for (let attempt = 0; attempt < 4; attempt++) {
			const response = await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
			});
			expect(response.error?.status).toBe(attempt === 3 ? 429 : undefined);
		}
	});

	it("applies the configured default policy to ordinary endpoints", async () => {
		const { client } = await getTestInstance({
			rateLimit: {
				enabled: true,
				policy: fixedWindow({ limit: 2, windowMs: 10_000 }),
			},
		});

		expect((await client.getSession()).error).toBeNull();
		expect((await client.getSession()).error).toBeNull();
		expect((await client.getSession()).error?.status).toBe(429);
	});

	it("uses the normalized path as the rate-limit scope", async () => {
		const { client } = await getTestInstance({
			rateLimit: {
				enabled: true,
				policy: fixedWindow({ limit: 2, windowMs: 10_000 }),
			},
		});

		for (let attempt = 0; attempt < 3; attempt++) {
			const response = await client.listSessions({
				fetchOptions: {
					query: { nonce: attempt.toString() },
				},
			});
			expect(response.error?.status).toBe(attempt === 2 ? 429 : 401);
		}
	});

	it("returns the remaining fixed-window delay and reopens at the boundary", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
		const { client, testUser } = await getTestInstance({
			rateLimit: { enabled: true },
		});

		for (let attempt = 0; attempt < 3; attempt++) {
			expect(
				(
					await client.signIn.email({
						email: testUser.email,
						password: testUser.password,
					})
				).error,
			).toBeNull();
		}

		vi.advanceTimersByTime(3_000);
		let retryAfter = "";
		let cacheControl = "";
		const blocked = await client.signIn.email(
			{ email: testUser.email, password: testUser.password },
			{
				onError(context) {
					retryAfter = context.response.headers.get("Retry-After") ?? "";
					cacheControl = context.response.headers.get("Cache-Control") ?? "";
				},
			},
		);
		expect(blocked.error?.status).toBe(429);
		expect(retryAfter).toBe("7");
		expect(cacheControl).toBe("no-store");

		vi.advanceTimersByTime(7_000);
		expect(
			(
				await client.signIn.email({
					email: testUser.email,
					password: testUser.password,
				})
			).error,
		).toBeNull();
	});

	it("supports wildcard policies and disabled scopes", async () => {
		const { client, testUser } = await getTestInstance({
			rateLimit: {
				enabled: true,
				policy: fixedWindow({ limit: 1, windowMs: 10_000 }),
				rules: {
					"/sign-in/*": fixedWindow({ limit: 2, windowMs: 10_000 }),
					"/get-session": false,
				},
			},
		});

		for (let attempt = 0; attempt < 3; attempt++) {
			const response = await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
			});
			expect(response.error?.status).toBe(attempt === 2 ? 429 : undefined);
		}

		for (let attempt = 0; attempt < 3; attempt++) {
			expect((await client.getSession()).error).toBeNull();
		}
	});

	it("prefers an exact rule over an earlier wildcard", async () => {
		const { client, testUser } = await getTestInstance({
			rateLimit: {
				enabled: true,
				rules: {
					"/sign-in/*": fixedWindow({ limit: 1, windowMs: 10_000 }),
					"/sign-in/email": fixedWindow({ limit: 2, windowMs: 10_000 }),
				},
			},
		});

		for (let attempt = 0; attempt < 3; attempt++) {
			const response = await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
			});
			expect(response.error?.status).toBe(attempt === 2 ? 429 : undefined);
		}
	});

	it("does not resolve a consumer key for a disabled scope", async () => {
		const key = vi.fn(() => "consumer");
		const { client } = await getTestInstance({
			rateLimit: {
				enabled: true,
				key,
				rules: { "/get-session": false },
			},
		});

		expect((await client.getSession()).error).toBeNull();
		expect(key).not.toHaveBeenCalled();
	});

	it("runs non-fixed-window policies through the same request pipeline", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
		const { client } = await getTestInstance({
			rateLimit: {
				enabled: true,
				rules: {
					"/get-session": tokenBucket({
						capacity: 2,
						refillRate: 1,
						refillIntervalMs: 1_000,
					}),
				},
			},
		});

		expect((await client.getSession()).error).toBeNull();
		expect((await client.getSession()).error).toBeNull();
		expect((await client.getSession()).error?.status).toBe(429);

		vi.advanceTimersByTime(1_000);
		expect((await client.getSession()).error).toBeNull();
	});
});

describe("rate-limit storage", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	for (const storage of ["memory", "database"] as const) {
		it(`atomically enforces a concurrent limit with ${storage} storage`, async () => {
			const { client, testUser } = await getTestInstance({
				rateLimit: {
					enabled: true,
					storage,
					rules: {
						"/sign-in/email": fixedWindow({
							limit: 1,
							windowMs: 10_000,
						}),
					},
				},
			});

			const responses = await Promise.all([
				client.signIn.email({
					email: testUser.email,
					password: testUser.password,
				}),
				client.signIn.email({
					email: testUser.email,
					password: testUser.password,
				}),
			]);

			expect(
				responses.map((response) => response.error?.status).sort(),
			).toEqual([429, undefined]);
		});
	}

	it("persists opaque versioned state with a CAS revision", async () => {
		const { auth, client } = await getTestInstance({
			rateLimit: {
				enabled: true,
				storage: "database",
				policy: fixedWindow({ limit: 5, windowMs: 10_000 }),
			},
		});

		await client.getSession();
		const ctx = await auth.$context;
		const row = await ctx.adapter.findOne<RateLimit>({
			model: "rateLimit",
			where: [
				{
					field: "key",
					value: requestStorageKey("/get-session", "127.0.0.1"),
				},
			],
		});

		expect(row).toMatchObject({ revision: 1 });
		expect(row?.expiresAt).toBeGreaterThan(Date.now());
		expect(parseRateLimitState(row?.state ?? "")).toMatchObject({
			strategy: "fixed-window",
			count: 1,
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10618
	 */
	it("awaits expired state cleanup without a background handler", async () => {
		const now = new Date("2026-01-01T00:00:00.000Z").getTime();
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now);
		const { auth, client } = await getTestInstance({
			rateLimit: { enabled: true, storage: "database" },
		});
		const ctx = await auth.$context;

		await client.getSession();
		await ctx.adapter.create({
			model: "rateLimit",
			data: {
				key: "expired",
				state: serializeRateLimitState({
					strategy: "fixed-window",
					policyKey: "expired",
					count: 1,
					resetAt: now - 1,
				}),
				expiresAt: now - 1,
				revision: 1,
			},
		});

		let releaseCleanup = () => {};
		const cleanupGate = new Promise<void>((resolve) => {
			releaseCleanup = resolve;
		});
		const originalDeleteMany = ctx.adapter.deleteMany.bind(ctx.adapter);
		const deleteMany = vi
			.spyOn(ctx.adapter, "deleteMany")
			.mockImplementation(async (input) => {
				await cleanupGate;
				return originalDeleteMany(input);
			});
		nowSpy.mockReturnValue(now + 60_001);

		let requestSettled = false;
		const request = client.getSession().finally(() => {
			requestSettled = true;
		});
		await vi.waitFor(() => expect(deleteMany).toHaveBeenCalledOnce());
		await Promise.resolve();
		expect(requestSettled).toBe(false);

		releaseCleanup();
		await request;
	});

	it("accepts a custom atomic storage implementation", async () => {
		const observed = createObservedStorage();
		const { client } = await getTestInstance({
			rateLimit: {
				enabled: true,
				customStorage: observed.storage,
			},
		});

		await client.getSession();
		expect(observed.consume).toHaveBeenCalledWith(
			requestStorageKey("/get-session", "127.0.0.1"),
			expect.objectContaining({ strategy: "fixed-window" }),
			undefined,
		);
	});
});

describe("rate-limit keys", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it("lets applications define a tenant or user key without changing core", async () => {
		const key = vi.fn(
			({ request }: { request: Request }) =>
				request.headers.get("x-tenant-id") ?? "anonymous",
		);
		const { client, testUser } = await getTestInstance({
			rateLimit: {
				enabled: true,
				key,
				rules: {
					"/sign-in/email": fixedWindow({ limit: 1, windowMs: 10_000 }),
				},
			},
		});

		const request = () =>
			client.signIn.email({
				email: testUser.email,
				password: testUser.password,
				fetchOptions: { headers: { "x-tenant-id": "acme" } },
			});
		expect((await request()).error).toBeNull();
		expect((await request()).error?.status).toBe(429);
		expect(key).toHaveBeenCalledWith(
			expect.objectContaining({
				path: "/sign-in/email",
				ip: "127.0.0.1",
			}),
		);
	});

	it("fails closed under one key when no trusted IP is available", async () => {
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("TEST", "false");
		vi.resetModules();
		const observed = createObservedStorage();
		const { getTestInstance: getReloadedTestInstance } = await import(
			"../../test-utils/test-instance"
		);
		const { client } = await getReloadedTestInstance({
			rateLimit: {
				enabled: true,
				customStorage: observed.storage,
				policy: fixedWindow({ limit: 1, windowMs: 10_000 }),
			},
		});

		expect((await client.getSession()).error).toBeNull();
		expect((await client.getSession()).error?.status).toBe(429);
		expect(observed.consume).toHaveBeenCalledWith(
			requestStorageKey("/get-session", "no-trusted-ip"),
			expect.anything(),
			undefined,
		);
	});

	it("uses a valid single-hop forwarded address", async () => {
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("TEST", "false");
		vi.resetModules();
		const observed = createObservedStorage();
		const { getTestInstance: getReloadedTestInstance } = await import(
			"../../test-utils/test-instance"
		);
		const { client } = await getReloadedTestInstance({
			rateLimit: {
				enabled: true,
				customStorage: observed.storage,
			},
		});

		await client.getSession({
			fetchOptions: { headers: { "x-forwarded-for": "198.51.100.4" } },
		});
		expect(observed.consume).toHaveBeenCalledWith(
			requestStorageKey("/get-session", "198.51.100.4"),
			expect.anything(),
			undefined,
		);
	});

	it("does not trust an unconfigured multi-hop forwarded chain", async () => {
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("TEST", "false");
		vi.resetModules();
		const observed = createObservedStorage();
		const { getTestInstance: getReloadedTestInstance } = await import(
			"../../test-utils/test-instance"
		);
		const { client } = await getReloadedTestInstance({
			rateLimit: {
				enabled: true,
				customStorage: observed.storage,
			},
		});

		await client.getSession({
			fetchOptions: {
				headers: {
					"x-forwarded-for": "198.51.100.4, 203.0.113.9",
				},
			},
		});
		expect(observed.consume).toHaveBeenCalledWith(
			requestStorageKey("/get-session", "no-trusted-ip"),
			expect.anything(),
			undefined,
		);
	});

	it("uses the client selected by the trusted-proxy chain", async () => {
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("TEST", "false");
		vi.resetModules();
		const observed = createObservedStorage();
		const { getTestInstance: getReloadedTestInstance } = await import(
			"../../test-utils/test-instance"
		);
		const { client } = await getReloadedTestInstance({
			rateLimit: {
				enabled: true,
				customStorage: observed.storage,
			},
			advanced: { ipAddress: { trustedProxies: ["10.0.0.0/8"] } },
		});

		await client.getSession({
			fetchOptions: {
				headers: {
					"x-forwarded-for": "203.0.113.9, 198.51.100.10, 10.0.0.5",
				},
			},
		});
		expect(observed.consume).toHaveBeenCalledWith(
			requestStorageKey("/get-session", "198.51.100.10"),
			expect.anything(),
			undefined,
		);
	});
});

describe("IPv6 address normalization", () => {
	it("normalizes equivalent IPv6 representations", () => {
		const representations = [
			"2001:db8::1",
			"2001:DB8::1",
			"2001:0db8::1",
			"2001:db8:0::1",
			"2001:0db8:0:0:0:0:0:1",
		];

		const normalized = representations.map((ip) => normalizeIP(ip));
		expect(new Set(normalized).size).toBe(1);
		expect(normalized[0]).toBe("2001:0db8:0000:0000:0000:0000:0000:0000");
	});

	it("converts IPv4-mapped IPv6 addresses to IPv4", () => {
		for (const address of [
			"::ffff:192.0.2.1",
			"::FFFF:192.0.2.1",
			"::ffff:c000:0201",
		]) {
			expect(normalizeIP(address)).toBe("192.0.2.1");
		}
	});

	it("groups IPv6 addresses by the configured subnet", () => {
		const normalized = [
			"2001:db8:abcd:1234:0000:0000:0000:0001",
			"2001:db8:abcd:1234:1111:2222:3333:4444",
			"2001:db8:abcd:1234:ffff:ffff:ffff:ffff",
		].map((ip) => normalizeIP(ip, { ipv6Subnet: 64 }));

		expect(new Set(normalized).size).toBe(1);
		expect(normalized[0]).toBe("2001:0db8:abcd:1234:0000:0000:0000:0000");
	});

	it("keeps distinct IPv6 subnets in separate keys", () => {
		const subnet1 = normalizeIP("2001:db8:abcd:1111::1", {
			ipv6Subnet: 64,
		});
		const subnet2 = normalizeIP("2001:db8:abcd:2222::1", {
			ipv6Subnet: 64,
		});
		expect(subnet1).not.toBe(subnet2);
	});

	it("normalizes localhost and link-local addresses", () => {
		expect(normalizeIP("::1")).toBe("0000:0000:0000:0000:0000:0000:0000:0000");
		expect(normalizeIP("fe80::1")).toBe(
			"fe80:0000:0000:0000:0000:0000:0000:0000",
		);
	});

	it("does not apply IPv6 subnet grouping to IPv4", () => {
		expect(normalizeIP("192.168.1.1", { ipv6Subnet: 64 })).toBe("192.168.1.1");
	});
});
