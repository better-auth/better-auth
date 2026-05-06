// @vitest-environment happy-dom

import { createFetch } from "@better-fetch/fetch";
import { atom } from "nanostores";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthQuery } from "./query";
import { createAuthClient } from "./solid";
import { testClientPlugin } from "./test-plugin";

/**
 * @see https://github.com/better-auth/better-auth/issues/8420
 */
describe("useAuthQuery - error handling", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("should preserve stale data on network error (fetch throws)", async () => {
		let shouldFail = false;

		const client = createAuthClient({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async (_url) => {
					if (shouldFail) {
						throw new TypeError("Failed to fetch");
					}
					return new Response(
						JSON.stringify({
							user: { id: "1", email: "test@test.com" },
							session: { id: "session-1" },
						}),
					);
				},
				baseURL: "http://localhost:3000",
			},
		});

		const session = client.useSession();
		await vi.runAllTimersAsync();

		expect(session().data).toMatchObject({
			user: { id: "1", email: "test@test.com" },
		});
		expect(session().error).toBeNull();

		// Network failure on refetch
		shouldFail = true;
		await session().refetch();
		await vi.runAllTimersAsync();

		// Stale data should be preserved
		expect(session().data).toMatchObject({
			user: { id: "1", email: "test@test.com" },
		});
	});

	it("should clear data on 401 unauthorized response", async () => {
		let returnUnauthorized = false;

		const client = createAuthClient({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async (url) => {
					const urlStr = typeof url === "string" ? url : url.toString();
					if (returnUnauthorized && urlStr.includes("/get-session")) {
						return new Response(JSON.stringify({ message: "Unauthorized" }), {
							status: 401,
						});
					}
					return new Response(
						JSON.stringify({
							user: { id: "1", email: "test@test.com" },
							session: { id: "session-1" },
						}),
					);
				},
				baseURL: "http://localhost:3000",
			},
		});

		const session = client.useSession();
		await vi.runAllTimersAsync();

		expect(session().data).toMatchObject({
			user: { id: "1", email: "test@test.com" },
		});

		// Refetch with 401
		returnUnauthorized = true;
		await session().refetch();
		await vi.runAllTimersAsync();

		expect(session().data).toBeNull();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9077
	 */
	it("should not refetch when atom re-mounts before the initial fetch resolves", async () => {
		let fetchCount = 0;
		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: async () => {
				fetchCount++;
				// Keep the fetch pending to widen the race window.
				return new Promise<Response>(() => {});
			},
		});

		const $signal = atom(false);
		const queryAtom = useAuthQuery<{ data: string }>($signal, "/test", $fetch, {
			method: "GET",
		});

		const unsubscribe1 = queryAtom.listen(() => {});
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchCount).toBe(1);

		// Wait out the unmount delay so the next listen re-fires mount.
		unsubscribe1();
		await vi.advanceTimersByTimeAsync(1000);

		// Second mount must not fire another fetch while the first is in flight.
		const unsubscribe2 = queryAtom.listen(() => {});
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchCount).toBe(1);

		unsubscribe2();
	});

	/**
	 * Reproduces the actual storm mechanism from
	 * https://github.com/better-auth/better-auth/issues/9077: multiple
	 * `onMount` callbacks accumulate on the value atom (nanostores appends
	 * MOUNT listeners) and all fire inside a single mount cycle, each
	 * scheduling its own `setTimeout(0)`. Before the fix they all drained
	 * before the flag flipped and each started a fetch.
	 */
	it("should fire only one fetch when multiple onMount callbacks run in one mount cycle", async () => {
		let fetchCount = 0;
		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: async () => {
				fetchCount++;
				return new Promise<Response>(() => {});
			},
		});

		const $signal = atom(false);
		const queryAtom = useAuthQuery<{ data: string }>($signal, "/test", $fetch, {
			method: "GET",
		});

		// Flipping the signal before any listener attaches re-runs the
		// subscribe callback, which appends another onMount listener each
		// time. After three flips there are four queued callbacks.
		$signal.set(true);
		$signal.set(false);
		$signal.set(true);

		const unsubscribe = queryAtom.listen(() => {});
		await vi.advanceTimersByTimeAsync(0);

		expect(fetchCount).toBe(1);

		unsubscribe();
	});

	it("should preserve stale data on 500 server error", async () => {
		let returnServerError = false;

		const client = createAuthClient({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async (url) => {
					const urlStr = typeof url === "string" ? url : url.toString();
					if (returnServerError && urlStr.includes("/get-session")) {
						return new Response(
							JSON.stringify({ message: "Internal Server Error" }),
							{ status: 500 },
						);
					}
					return new Response(
						JSON.stringify({
							user: { id: "1", email: "test@test.com" },
							session: { id: "session-1" },
						}),
					);
				},
				baseURL: "http://localhost:3000",
			},
		});

		const session = client.useSession();
		await vi.runAllTimersAsync();

		expect(session().data).toMatchObject({
			user: { id: "1", email: "test@test.com" },
		});

		// Refetch with 500
		returnServerError = true;
		await session().refetch();
		await vi.runAllTimersAsync();

		// Stale data should be preserved on 500
		expect(session().data).toMatchObject({
			user: { id: "1", email: "test@test.com" },
		});
	});
});
