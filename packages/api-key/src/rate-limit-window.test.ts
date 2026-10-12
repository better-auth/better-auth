import { getTestInstance } from "better-auth/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiKey } from ".";
import { apiKeyClient } from "./client";

/**
 * Fixed-window rate limiting for API keys.
 *
 * @see https://github.com/better-auth/better-auth/issues/11680
 */
describe("api-key rate limit fixed window", async () => {
	const WINDOW = 60_000;
	const MAX = 60;

	const { client, auth, signInWithTestUser } = await getTestInstance(
		{
			plugins: [
				apiKey({
					rateLimit: {
						enabled: true,
						timeWindow: WINDOW,
						maxRequests: MAX,
					},
				}),
			],
		},
		{
			clientOptions: {
				plugins: [apiKeyClient()],
			},
		},
	);

	afterEach(() => {
		vi.useRealTimers();
	});

	async function createKey() {
		const { headers } = await signInWithTestUser();
		const { data: key } = await client.apiKey.create({}, { headers });
		if (!key) throw new Error("apiKey.create returned null");
		return key;
	}

	it("never rate limits steady traffic below maxRequests", async () => {
		const key = await createKey();

		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

		// The reporter's scenario: one verification every 1.5 seconds
		// (40 a minute, under the limit of 60 per 60s window) for five
		// minutes. A fixed window anchored at its first request never
		// denies any of these; the pre-fix sliding behavior denied
		// request 61 onward until a full window passed with no traffic.
		let denied = 0;
		for (let i = 0; i < 200; i++) {
			vi.advanceTimersByTime(1500);
			const res = await auth.api.verifyApiKey({
				body: { key: key.key },
			});
			if (res.error) {
				denied++;
			}
		}
		// Requests run one at a time under a frozen fake clock, so no
		// request can straddle the window seam mid-decision: the fixed
		// window must deny none of them.
		expect(denied).toBe(0);
	});

	it("anchors the window: lastRequest keeps the opening time while requests are allowed", async () => {
		const key = await createKey();

		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

		const startAt = new Date("2026-01-01T00:00:00Z").getTime();
		const anchorMs = 1500; // first request at t=1.5s
		for (let i = 0; i < 3; i++) {
			vi.advanceTimersByTime(anchorMs);
			const res = await auth.api.verifyApiKey({
				body: { key: key.key },
			});
			expect(res.error).toBeNull();
			// The window stays anchored at the first request's time: the
			// second and third allowed requests do not move lastRequest.
			expect(res.key?.lastRequest?.getTime()).toBe(startAt + anchorMs);
		}
	});

	it("resets the window exactly when it elapses, including at the boundary instant", async () => {
		const key = await createKey();

		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

		const startAt = new Date("2026-01-01T00:00:00Z").getTime();
		// First request opens the window at t=1500ms.
		vi.advanceTimersByTime(1500);
		const first = await auth.api.verifyApiKey({ body: { key: key.key } });
		expect(first.error).toBeNull();
		expect(first.key?.lastRequest?.getTime()).toBe(startAt + 1500);

		// A request exactly one window later must reset, not hang or deny:
		// the guarded reset (`lastRequest <= windowStart`) holds at equality.
		vi.advanceTimersByTime(WINDOW);
		const boundary = await auth.api.verifyApiKey({
			body: { key: key.key },
		});
		expect(boundary.error).toBeNull();
		expect(boundary.key?.requestCount).toBe(1);
		expect(boundary.key?.lastRequest?.getTime()).toBe(startAt + 1500 + WINDOW);
	});

	it("still denies a burst above maxRequests within one window", async () => {
		const key = await createKey();

		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

		let denied = 0;
		for (let i = 0; i < MAX + 5; i++) {
			vi.advanceTimersByTime(100);
			const res = await auth.api.verifyApiKey({
				body: { key: key.key },
			});
			if (res.error) {
				denied++;
				expect(res.error.code).toBe("RATE_LIMITED");
			}
		}
		expect(denied).toBe(5);
	});

	it("reports the time left in the window when denying", async () => {
		const key = await createKey();

		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

		for (let i = 0; i < MAX; i++) {
			vi.advanceTimersByTime(100);
			await auth.api.verifyApiKey({ body: { key: key.key } });
		}
		const deniedRes = await auth.api.verifyApiKey({
			body: { key: key.key },
		});
		expect(deniedRes.error?.code).toBe("RATE_LIMITED");
		const details = (deniedRes.error as any)?.details as
			| { tryAgainIn?: number }
			| undefined;
		expect(details?.tryAgainIn).toBeDefined();
		// The window opened at t=100ms and closes at t=60100ms; the denial
		// arrives at t=6000ms, so the time left in the window is 54100ms.
		// Pre-fix this reported the time since the latest allowed request
		// (100ms ago) instead of the time left in the window.
		expect(details?.tryAgainIn).toBe(54100);
	});
});

describe("api-key rate limit fixed window (secondary storage)", async () => {
	const WINDOW = 60_000;
	const MAX = 3;

	const store = new Map<string, string>();
	const secondaryStorage: {
		set: (key: string, value: string, ttl?: number) => void;
		get: (key: string) => string | null;
		getAndDelete: (key: string) => string | null;
		increment: (key: string, ttl?: number) => number;
		delete: (key: string) => void;
	} = {
		set(key, value) {
			store.set(key, value);
		},
		get(key) {
			return store.get(key) ?? null;
		},
		getAndDelete(key) {
			const value = store.get(key) ?? null;
			store.delete(key);
			return value;
		},
		increment(key) {
			const count = Number(store.get(key) ?? 0) + 1;
			store.set(key, String(count));
			return count;
		},
		delete(key) {
			store.delete(key);
		},
	};

	const { client, auth, signInWithTestUser } = await getTestInstance(
		{
			secondaryStorage: secondaryStorage as never,
			plugins: [
				apiKey({
					storage: "secondary-storage",
					rateLimit: {
						enabled: true,
						timeWindow: WINDOW,
						maxRequests: MAX,
					},
				}),
			],
		},
		{
			clientOptions: {
				plugins: [apiKeyClient()],
			},
		},
	);

	afterEach(() => {
		vi.useRealTimers();
	});

	it("anchors the window on secondary storage: steady traffic below maxRequests is never denied", async () => {
		const { headers } = await signInWithTestUser();
		const { data: key } = await client.apiKey.create({}, { headers });
		if (!key) throw new Error("apiKey.create returned null");

		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

		// One request every 30s (2/min) against max 3 per 60s window for
		// five minutes: a fixed window never denies; the sliding behavior
		// denies request 4 onward until a full window of silence passes.
		let denied = 0;
		for (let i = 0; i < 10; i++) {
			vi.advanceTimersByTime(30_000);
			const res = await auth.api.verifyApiKey({
				body: { key: key.key },
			});
			if (res.error) {
				denied++;
			}
		}
		expect(denied).toBe(0);
	});

	it("denies a burst above maxRequests within one window on secondary storage", async () => {
		const { headers } = await signInWithTestUser();
		const { data: key } = await client.apiKey.create({}, { headers });
		if (!key) throw new Error("apiKey.create returned null");

		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

		let denied = 0;
		for (let i = 0; i < MAX + 2; i++) {
			vi.advanceTimersByTime(1000);
			const res = await auth.api.verifyApiKey({
				body: { key: key.key },
			});
			if (res.error) {
				denied++;
				expect(res.error.code).toBe("RATE_LIMITED");
			}
		}
		expect(denied).toBe(2);
	});
});
