import { describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "./limiter";
import { fixedWindow } from "./policy";
import type { RateLimitResult } from "./state";
import type { RateLimitStorage } from "./storage/contract";
import { createMemoryRateLimitStorage } from "./storage/memory";

const policy = fixedWindow({ limit: 1, windowMs: 1_000 });

describe("rate limiter", () => {
	it("passes a canonical namespaced key and request cost to storage", async () => {
		const result: RateLimitResult = {
			allowed: true,
			remaining: 2,
			retryAfterMs: null,
			resetAt: 1_000,
		};
		const consume = vi
			.fn<RateLimitStorage["consume"]>()
			.mockResolvedValue(result);
		const limiter = createRateLimiter({
			namespace: "core.request",
			storage: { consume },
		});

		await expect(
			limiter.consume({
				scope: "/sign-in/email",
				key: "127.0.0.1",
				policy,
				cost: 2,
			}),
		).resolves.toBe(result);
		expect(consume).toHaveBeenCalledWith(
			'rate-limit:v1:["core.request","/sign-in/email","127.0.0.1"]',
			policy,
			{ cost: 2 },
		);
	});

	it("keeps namespaces and scopes in independent buckets", async () => {
		const storage = createMemoryRateLimitStorage({ clock: () => 0 });
		const requestLimiter = createRateLimiter({
			namespace: "core.request",
			storage,
		});
		const apiKeyLimiter = createRateLimiter({
			namespace: "api-key",
			storage,
		});

		await expect(
			requestLimiter.consume({ scope: "sign-in", key: "same", policy }),
		).resolves.toMatchObject({ allowed: true });
		await expect(
			requestLimiter.consume({ scope: "sign-up", key: "same", policy }),
		).resolves.toMatchObject({ allowed: true });
		await expect(
			apiKeyLimiter.consume({ scope: "sign-in", key: "same", policy }),
		).resolves.toMatchObject({ allowed: true });
		await expect(
			requestLimiter.consume({ scope: "sign-in", key: "same", policy }),
		).resolves.toMatchObject({ allowed: false });
	});

	it("does not collide when dimensions contain separators", async () => {
		const consume = vi.fn<RateLimitStorage["consume"]>().mockResolvedValue({
			allowed: true,
			remaining: 0,
			retryAfterMs: null,
			resetAt: 1_000,
		});
		const first = createRateLimiter({
			namespace: "a|b",
			storage: { consume },
		});
		const second = createRateLimiter({
			namespace: "a",
			storage: { consume },
		});

		await first.consume({ scope: "c", key: "d", policy });
		await second.consume({ scope: "b|c", key: "d", policy });

		expect(consume.mock.calls[0]?.[0]).not.toBe(consume.mock.calls[1]?.[0]);
	});

	it("rejects missing bucket dimensions", () => {
		const consume = vi.fn<RateLimitStorage["consume"]>();

		expect(() =>
			createRateLimiter({ namespace: "", storage: { consume } }),
		).toThrow("namespace must not be empty");

		const limiter = createRateLimiter({
			namespace: "core.request",
			storage: { consume },
		});
		expect(() => limiter.consume({ scope: "", key: "key", policy })).toThrow(
			"scope must not be empty",
		);
		expect(() => limiter.consume({ scope: "scope", key: "", policy })).toThrow(
			"key must not be empty",
		);
		expect(consume).not.toHaveBeenCalled();
	});
});
