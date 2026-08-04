// @vitest-environment happy-dom

import { createFetch } from "@better-fetch/fetch";
import { atom, STORE_UNMOUNT_DELAY } from "nanostores";
import { act, createElement, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGlobalFocusManager } from "./focus-manager";
import { useAuthQuery } from "./query";
import { createAuthClient as createReactAuthClient } from "./react";
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
		vi.unstubAllGlobals();
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
	it("should defer remount refetch until the initial fetch resolves", async () => {
		let fetchCount = 0;
		let resolveInitialFetch: ((response: Response) => void) | undefined;
		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: async () => {
				fetchCount++;
				if (fetchCount === 1) {
					// Keep the first fetch pending to widen the race window.
					return new Promise<Response>((resolve) => {
						resolveInitialFetch = resolve;
					});
				}
				return new Response(JSON.stringify({ data: "fresh" }));
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

		if (!resolveInitialFetch) throw new Error("Initial fetch did not start");
		resolveInitialFetch(new Response(JSON.stringify({ data: "stale" })));
		await vi.runAllTimersAsync();
		expect(fetchCount).toBe(2);

		unsubscribe2();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10363
	 */
	it("should revalidate and restore signal listeners after remount", async () => {
		let fetchCount = 0;
		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: async () => {
				fetchCount++;
				return new Response(
					JSON.stringify({
						data: `request-${fetchCount}`,
					}),
				);
			},
		});

		const $signal = atom(false);
		const queryAtom = useAuthQuery<{ data: string }>($signal, "/test", $fetch, {
			method: "GET",
		});

		const unsubscribe1 = queryAtom.listen(() => {});
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchCount).toBe(1);
		expect(queryAtom.get().data).toEqual({ data: "request-1" });

		unsubscribe1();
		await vi.advanceTimersByTimeAsync(1000);

		// Signals emitted while unmounted are recovered by remount revalidation.
		$signal.set(true);
		await vi.runAllTimersAsync();
		expect(fetchCount).toBe(1);

		const unsubscribe2 = queryAtom.listen(() => {});
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchCount).toBe(2);
		expect(queryAtom.get().data).toEqual({ data: "request-2" });

		// The signal listener must be active again after remount.
		$signal.set(false);
		await vi.runAllTimersAsync();
		expect(fetchCount).toBe(3);
		expect(queryAtom.get().data).toEqual({ data: "request-3" });

		unsubscribe2();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9077
	 */
	it("should fire only one initial fetch when signals change around mount", async () => {
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

		// Signals emitted before the query mounts must not create extra initial
		// fetches or lifecycle callbacks.
		$signal.set(true);
		$signal.set(false);
		$signal.set(true);

		const unsubscribe = queryAtom.listen(() => {});
		$signal.set(false);
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

	it("should allow an unmounted session request to settle", async () => {
		let fetchSignal: AbortSignal | undefined;
		let resolveFetch: ((response: Response) => void) | undefined;
		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: async (_url, init) => {
				fetchSignal = init?.signal ?? undefined;
				return new Promise<Response>((resolve) => {
					resolveFetch = resolve;
				});
			},
		});
		const { session } = getSessionAtom($fetch);

		const unsubscribe = session.listen(() => {});
		await vi.advanceTimersByTimeAsync(0);

		expect(session.get().isPending).toBe(true);
		expect(session.get().isRefetching).toBe(true);

		unsubscribe();
		await vi.advanceTimersByTimeAsync(STORE_UNMOUNT_DELAY);

		expect(fetchSignal?.aborted).toBe(false);
		expect(session.value.isPending).toBe(true);
		expect(session.value.isRefetching).toBe(true);

		if (!resolveFetch) throw new Error("Session fetch did not start");
		resolveFetch(new Response(JSON.stringify({ session: null, user: null })));
		await vi.runAllTimersAsync();

		expect(session.value.isPending).toBe(false);
		expect(session.value.isRefetching).toBe(false);
	});

	it("should abort a session request superseded by refetch", async () => {
		const requests: Array<{
			resolve: (response: Response) => void;
			signal: AbortSignal | null;
		}> = [];
		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: async (_url, init) => {
				return new Promise<Response>((resolve) => {
					requests.push({ resolve, signal: init?.signal ?? null });
				});
			},
		});
		const { session } = getSessionAtom($fetch);
		const unsubscribe = session.listen(() => {});
		await vi.advanceTimersByTimeAsync(0);

		const refetchPromise = session.value.refetch();
		await vi.advanceTimersByTimeAsync(0);
		expect(requests).toHaveLength(2);
		expect(requests[0]?.signal?.aborted).toBe(true);
		expect(requests[1]?.signal?.aborted).toBe(false);

		for (const request of requests) {
			request.resolve(
				new Response(JSON.stringify({ session: null, user: null })),
			);
		}
		await refetchPromise;
		unsubscribe();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10667
	 */
	it("should let a listener refetch supersede the current session request", async () => {
		const requests: Array<{
			resolve: (response: Response) => void;
			signal: AbortSignal | null;
		}> = [];
		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: async (_url, init) =>
				new Promise<Response>((resolve) => {
					requests.push({ resolve, signal: init?.signal ?? null });
				}),
		});
		const { session } = getSessionAtom($fetch);
		let refetchPromise: Promise<void> | undefined;
		const unsubscribe = session.listen((current) => {
			if (current.isRefetching && !refetchPromise) {
				refetchPromise = current.refetch();
			}
		});

		await vi.advanceTimersByTimeAsync(0);

		expect(requests).toHaveLength(1);
		expect(requests[0]?.signal?.aborted).toBe(false);

		requests[0]?.resolve(
			new Response(JSON.stringify({ session: null, user: null })),
		);
		if (!refetchPromise) throw new Error("Listener refetch was not triggered");
		await refetchPromise;
		unsubscribe();
	});

	it("should revalidate session after a settled request is remounted", async () => {
		let fetchCount = 0;
		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: async () => {
				fetchCount++;
				return new Response(JSON.stringify({ session: null, user: null }));
			},
		});
		const { session } = getSessionAtom($fetch);

		const unsubscribeFirst = session.listen(() => {});
		await vi.runAllTimersAsync();
		expect(fetchCount).toBe(1);

		unsubscribeFirst();
		await vi.advanceTimersByTimeAsync(STORE_UNMOUNT_DELAY);
		const unsubscribeSecond = session.listen(() => {});
		await vi.runAllTimersAsync();

		expect(fetchCount).toBe(2);
		unsubscribeSecond();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10667
	 */
	it("should deduplicate the initial session request across Suspense retries", async () => {
		vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
		let suspended = true;
		let resumeRender: (() => void) | undefined;
		const requests: Array<{
			resolve: (response: Response) => void;
			signal: AbortSignal | null;
		}> = [];
		const client = createReactAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl: (_url, init) => {
					return new Promise<Response>((resolve) => {
						requests.push({ resolve, signal: init?.signal ?? null });
					});
				},
			},
		});
		const SessionWatcher = () => {
			client.useSession();
			if (suspended) {
				throw new Promise<void>((resolve) => {
					resumeRender = resolve;
				});
			}
			return null;
		};
		const root = createRoot(document.createElement("div"));

		await act(async () => {
			root.render(
				createElement(
					Suspense,
					{ fallback: null },
					createElement(SessionWatcher),
				),
			);
			await vi.advanceTimersByTimeAsync(0);
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(STORE_UNMOUNT_DELAY);
		});

		const retry = resumeRender;
		if (!retry) throw new Error("Suspense retry was not scheduled");
		suspended = false;
		await act(async () => retry());
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});

		const observedRequests = requests.map(({ signal }) => ({
			aborted: signal?.aborted ?? false,
		}));
		await act(async () => {
			root.unmount();
			for (const request of requests) {
				request.resolve(
					new Response(JSON.stringify({ session: null, user: null })),
				);
			}
			await Promise.resolve();
		});
		expect(observedRequests).toEqual([{ aborted: false }]);
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
