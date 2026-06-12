// @vitest-environment happy-dom

import { createFetch } from "@better-fetch/fetch";
import { atom } from "nanostores";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGlobalFocusManager } from "./focus-manager";
import { useAuthQuery } from "./query";
import { getSessionAtom } from "./session-atom";
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
		delete (globalThis as any)[Symbol.for("better-auth:broadcast-channel")];
		delete (globalThis as any)[Symbol.for("better-auth:focus-manager")];
		delete (globalThis as any)[Symbol.for("better-auth:online-manager")];
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

	it("should normalize null session responses to null data", async () => {
		const client = createAuthClient({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async () =>
					new Response(JSON.stringify({ session: null, user: null })),
				baseURL: "http://localhost:3000",
			},
		});

		const session = client.useSession();
		await vi.runAllTimersAsync();

		expect(session().data).toBeNull();
	});

	it("should preserve non-null session responses without a session object", async () => {
		const client = createAuthClient({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async () =>
					new Response(
						JSON.stringify({
							user: { id: "1", email: "test@test.com" },
						}),
					),
				baseURL: "http://localhost:3000",
			},
		});

		const session = client.useSession();
		await vi.runAllTimersAsync();

		expect(session().data).toMatchObject({
			user: { id: "1", email: "test@test.com" },
		});
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

	it("should preserve the session data reference when refetch returns identical data", async () => {
		const getSessionPayload = () => ({
			user: { id: "1", email: "test@test.com" },
			session: { id: "session-1" },
		});

		const client = createAuthClient({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async () =>
					new Response(JSON.stringify(getSessionPayload())),
				baseURL: "http://localhost:3000",
			},
		});

		const session = client.useSession();
		await vi.runAllTimersAsync();

		const initialData = session().data;
		expect(initialData).not.toBeNull();

		await session().refetch();
		await vi.runAllTimersAsync();

		// Reference should be preserved because data is structurally identical
		expect(session().data).toBe(initialData);
	});

	it("should clear loading flags when an unmounted session request is aborted", async () => {
		let fetchSignal: AbortSignal | undefined;
		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: async (_url, init) => {
				fetchSignal = init?.signal ?? undefined;
				return new Promise<Response>(() => {});
			},
		});
		const { session } = getSessionAtom($fetch);

		const unsubscribe = session.listen(() => {});
		await vi.advanceTimersByTimeAsync(0);

		expect(session.get().isPending).toBe(true);
		expect(session.get().isRefetching).toBe(true);

		unsubscribe();
		await vi.advanceTimersByTimeAsync(1000);

		expect(fetchSignal?.aborted).toBe(true);
		expect(session.get().isPending).toBe(false);
		expect(session.get().isRefetching).toBe(false);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9613
	 */
	it("should avoid an extra post-focus session fetch when the refreshed payload is unchanged", async () => {
		let fetchCallCount = 0;
		const getSessionPayload = () => ({
			user: { id: "1", email: "test@test.com" },
			session: { id: "session-1" },
		});

		const client = createAuthClient({
			plugins: [testClientPlugin()],
			sessionOptions: {
				refetchOnWindowFocus: true,
			},
			fetchOptions: {
				customFetchImpl: async () => {
					fetchCallCount++;
					return new Response(JSON.stringify(getSessionPayload()));
				},
				baseURL: "http://localhost:3000",
			},
		});

		const session = client.useSession();
		await vi.runAllTimersAsync();

		const initialData = session().data;
		expect(fetchCallCount).toBe(1);

		getGlobalFocusManager().setFocused(true);
		await vi.runAllTimersAsync();

		// Only 2 fetches: initial + focus refetch (no double-fetch)
		expect(fetchCallCount).toBe(2);
		expect(session().data).toBe(initialData);
	});
});
