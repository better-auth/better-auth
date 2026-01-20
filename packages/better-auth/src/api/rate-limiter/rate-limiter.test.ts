import { normalizeIP } from "@better-auth/core/utils/ip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import type { RateLimit } from "../../types";

describe("rate-limiter", async () => {
	const { client, testUser } = await getTestInstance({
		rateLimit: {
			enabled: true,
			window: 10,
			max: 20,
		},
	});

	it("should return 429 after 3 request for sign-in", async () => {
		for (let i = 0; i < 5; i++) {
			const response = await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
			});
			if (i >= 3) {
				expect(response.error?.status).toBe(429);
			} else {
				expect(response.error).toBeNull();
			}
		}
	});

	it("should reset the limit after the window period", async () => {
		vi.useFakeTimers();
		vi.advanceTimersByTime(11000);
		for (let i = 0; i < 5; i++) {
			const res = await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
			});
			if (i >= 3) {
				expect(res.error?.status).toBe(429);
			} else {
				expect(res.error).toBeNull();
			}
		}
	});

	it("should respond the correct retry-after header", async () => {
		vi.useFakeTimers();
		vi.advanceTimersByTime(3000);
		let retryAfter = "";
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onError(context) {
					retryAfter = context.response.headers.get("X-Retry-After") ?? "";
				},
			},
		);
		expect(retryAfter).toBe("7");
	});

	it("should rate limit based on the path", async () => {
		const signInRes = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
		});
		expect(signInRes.error?.status).toBe(429);

		const signUpRes = await client.signUp.email({
			email: "new-test@email.com",
			password: testUser.password,
			name: "test",
		});
		expect(signUpRes.error).toBeNull();
	});

	it("non-special-rules limits", async () => {
		for (let i = 0; i < 25; i++) {
			const response = await client.getSession();
			expect(response.error?.status).toBe(i >= 20 ? 429 : undefined);
		}
	});

	it("query params should be ignored", async () => {
		for (let i = 0; i < 25; i++) {
			const response = await client.listSessions({
				fetchOptions: {
					query: {
						"test-query": Math.random().toString(),
					},
				},
			});

			if (i >= 20) {
				expect(response.error?.status).toBe(429);
			} else {
				expect(response.error?.status).toBe(401);
			}
		}
	});
});

describe("custom rate limiting storage", async () => {
	const store = new Map<string, string>();
	const expirationMap = new Map<string, number>();
	const { client, testUser } = await getTestInstance({
		rateLimit: {
			enabled: true,
		},
		secondaryStorage: {
			set(key, value, ttl) {
				store.set(key, value);
				if (ttl) expirationMap.set(key, ttl);
			},
			get(key) {
				return store.get(key) || null;
			},
			delete(key) {
				store.delete(key);
				expirationMap.delete(key);
			},
		},
	});

	it("should use custom storage", async () => {
		await client.getSession();
		expect(store.size).toBe(3);
		let lastRequest = Date.now();
		for (let i = 0; i < 4; i++) {
			const response = await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
			});
			const rateLimitData: RateLimit = JSON.parse(
				store.get("127.0.0.1|/sign-in/email") ?? "{}",
			);
			expect(rateLimitData.lastRequest).toBeGreaterThanOrEqual(lastRequest);
			lastRequest = rateLimitData.lastRequest;
			if (i >= 3) {
				expect(response.error?.status).toBe(429);
				expect(rateLimitData.count).toBe(3);
			} else {
				expect(response.error).toBeNull();
				expect(rateLimitData.count).toBe(i + 1);
			}
			const rateLimitExp = expirationMap.get("127.0.0.1|/sign-in/email");
			expect(rateLimitExp).toBe(10);
		}
	});
});

describe("should work with custom rules", async () => {
	const { client, testUser } = await getTestInstance({
		rateLimit: {
			enabled: true,
			storage: "database",
			customRules: {
				"/sign-in/*": {
					window: 10,
					max: 2,
				},
				"/sign-up/email": {
					window: 10,
					max: 3,
				},
				"/get-session": false,
			},
		},
	});

	it("should use custom rules", async () => {
		for (let i = 0; i < 4; i++) {
			const response = await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
			});
			if (i >= 2) {
				expect(response.error?.status).toBe(429);
			} else {
				expect(response.error).toBeNull();
			}
		}

		for (let i = 0; i < 5; i++) {
			const response = await client.signUp.email({
				email: `${Math.random()}@test.com`,
				password: testUser.password,
				name: "test",
			});
			if (i >= 3) {
				expect(response.error?.status).toBe(429);
			} else {
				expect(response.error).toBeNull();
			}
		}
	});

	it("should use default rules if custom rules are not defined", async () => {
		for (let i = 0; i < 5; i++) {
			const response = await client.getSession();
			if (i >= 20) {
				expect(response.error?.status).toBe(429);
			} else {
				expect(response.error).toBeNull();
			}
		}
	});

	it("should not rate limit if custom rule is false", async () => {
		let i = 0;
		let response = null;
		for (; i < 110; i++) {
			response = await client.getSession().then((res) => res.error);
		}
		expect(response).toBeNull();
		expect(i).toBe(110);
	});
});

describe("should work in development/test environment", () => {
	const LOCALHOST_IP = "127.0.0.1";
	const REQUEST_PATH = "/sign-in/email";

	let originalNodeEnv: string | undefined;
	beforeEach(() => {
		originalNodeEnv = process.env.NODE_ENV;
	});
	afterEach(() => {
		process.env.NODE_ENV = originalNodeEnv;
		vi.unstubAllEnvs();
	});

	it("should work in development environment", async () => {
		vi.stubEnv("NODE_ENV", "development");

		const store = new Map<string, string>();
		const { client, testUser } = await getTestInstance({
			rateLimit: {
				enabled: true,
				window: 10,
				max: 3,
			},
			secondaryStorage: {
				set(key, value) {
					store.set(key, value);
				},
				get(key) {
					return store.get(key) || null;
				},
				delete(key) {
					store.delete(key);
				},
			},
		});

		for (let i = 0; i < 4; i++) {
			const response = await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
			});

			if (i >= 3) {
				expect(response.error?.status).toBe(429);
			} else {
				expect(response.error).toBeNull();
			}
		}

		const signInKeys = Array.from(store.keys()).filter((key) =>
			key.endsWith(REQUEST_PATH),
		);

		expect(signInKeys.length).toBeGreaterThan(0);
		expect(signInKeys[0]).toBe(`${LOCALHOST_IP}|${REQUEST_PATH}`);
	});

	it("should work in test environment", async () => {
		vi.stubEnv("NODE_ENV", "test");

		const store = new Map<string, string>();
		const { client, testUser } = await getTestInstance({
			rateLimit: {
				enabled: true,
				window: 10,
				max: 3,
			},
			secondaryStorage: {
				set(key, value) {
					store.set(key, value);
				},
				get(key) {
					return store.get(key) || null;
				},
				delete(key) {
					store.delete(key);
				},
			},
		});

		for (let i = 0; i < 4; i++) {
			const response = await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
			});

			if (i >= 3) {
				expect(response.error?.status).toBe(429);
			} else {
				expect(response.error).toBeNull();
			}
		}

		const signInKeys = Array.from(store.keys()).filter((key) =>
			key.endsWith(REQUEST_PATH),
		);

		expect(signInKeys.length).toBeGreaterThan(0);
		expect(signInKeys[0]).toBe(`${LOCALHOST_IP}|${REQUEST_PATH}`);
	});
});

describe("IPv6 address normalization and rate limiting", () => {
	it("should normalize IPv6 addresses to canonical form", () => {
		// All these representations of the same IPv6 address should normalize to the same value
		const representations = [
			"2001:db8::1",
			"2001:DB8::1",
			"2001:0db8::1",
			"2001:db8:0::1",
			"2001:0db8:0:0:0:0:0:1",
		];

		const normalized = representations.map((ip) => normalizeIP(ip));
		const uniqueValues = new Set(normalized);

		// All should normalize to the same value
		expect(uniqueValues.size).toBe(1);
		expect(normalized[0]).toBe("2001:0db8:0000:0000:0000:0000:0000:0001");
	});

	it("should convert IPv4-mapped IPv6 to IPv4", () => {
		const ipv4Mapped = [
			"::ffff:192.0.2.1",
			"::FFFF:192.0.2.1",
			"::ffff:c000:0201", // hex-encoded
		];

		const normalized = ipv4Mapped.map((ip) => normalizeIP(ip));

		// All should normalize to the same IPv4 address
		normalized.forEach((ip) => {
			expect(ip).toBe("192.0.2.1");
		});
	});

	it("should support IPv6 subnet rate limiting", () => {
		// Simulate attacker rotating through IPv6 addresses in their /64 allocation
		const attackIPs = [
			"2001:db8:abcd:1234:0000:0000:0000:0001",
			"2001:db8:abcd:1234:1111:2222:3333:4444",
			"2001:db8:abcd:1234:ffff:ffff:ffff:ffff",
		];

		const normalized = attackIPs.map((ip) =>
			normalizeIP(ip, { ipv6Subnet: 64 }),
		);

		// All should map to same /64 subnet
		const uniqueValues = new Set(normalized);
		expect(uniqueValues.size).toBe(1);
		expect(normalized[0]).toBe("2001:0db8:abcd:1234:0000:0000:0000:0000");
	});

	it("should rate limit different IPv6 subnets separately", () => {
		// Different /64 subnets should have separate rate limits
		const subnet1IPs = ["2001:db8:abcd:1111::1", "2001:db8:abcd:1111::2"];
		const subnet2IPs = ["2001:db8:abcd:2222::1", "2001:db8:abcd:2222::2"];

		const normalized1 = subnet1IPs.map((ip) =>
			normalizeIP(ip, { ipv6Subnet: 64 }),
		);
		const normalized2 = subnet2IPs.map((ip) =>
			normalizeIP(ip, { ipv6Subnet: 64 }),
		);

		// Same subnet should normalize to same value
		expect(normalized1[0]).toBe(normalized1[1]);
		expect(normalized2[0]).toBe(normalized2[1]);

		// Different subnets should normalize to different values
		expect(normalized1[0]).not.toBe(normalized2[0]);
	});

	it("should handle localhost IPv6 addresses", () => {
		expect(normalizeIP("::1")).toBe("0000:0000:0000:0000:0000:0000:0000:0001");
	});

	it("should handle link-local IPv6 addresses", () => {
		const linkLocal = normalizeIP("fe80::1");
		expect(linkLocal).toBe("fe80:0000:0000:0000:0000:0000:0000:0001");
	});

	it("IPv6 subnet should not affect IPv4 addresses", () => {
		const ipv4 = "192.168.1.1";
		const normalized = normalizeIP(ipv4, { ipv6Subnet: 64 });
		expect(normalized).toBe(ipv4);
	});
});
