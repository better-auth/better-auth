// @vitest-environment happy-dom

import { createFetch } from "@better-fetch/fetch";
import { atom, STORE_UNMOUNT_DELAY } from "nanostores";
import { act, createElement, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGlobalFocusManager } from "./focus-manager";
import { useAuthQuery } from "./query";
import { createAuthClient as createReactAuthClient } from "./react";
import { getSessionAtom, SESSION_FETCH_TIMEOUT_MS } from "./session-atom";
import { SIGNAL_REFETCH_DAMP_MS } from "./session-refresh";
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

	it.each([
		{
			earlier: "unauthorized",
			initialOutcome: () =>
				Response.json({ message: "Unauthorized" }, { status: 401 }),
			refreshedResponse: () => Response.json({ id: "current" }),
			expectedData: { id: "current" },
		},
		{
			earlier: "successful",
			initialOutcome: () => Response.json({ id: "previous" }),
			refreshedResponse: () =>
				Response.json({ message: "Unauthorized" }, { status: 401 }),
			expectedData: null,
		},
		{
			earlier: "network failure",
			initialOutcome: () => new TypeError("Failed to fetch"),
			refreshedResponse: () => Response.json({ id: "current" }),
			expectedData: { id: "current" },
		},
	])("keeps the latest result when an earlier $earlier request finishes last", async ({
		initialOutcome,
		refreshedResponse,
		expectedData,
	}) => {
		const initialRequest = Promise.withResolvers<Response>();
		const fetchImpl = vi
			.fn(async () => refreshedResponse())
			.mockImplementationOnce(() => initialRequest.promise);
		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: fetchImpl,
		});

		const $signal = atom(false);
		const query = useAuthQuery<{ id: string }>($signal, "/test", $fetch, {
			method: "GET",
		});
		const unsubscribe = query.listen(() => {});
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchImpl).toHaveBeenCalledOnce();

		$signal.set(true);
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(query.get().data).toEqual(expectedData);
		const latestState = query.get();

		const outcome = initialOutcome();
		if (outcome instanceof Error) {
			initialRequest.reject(outcome);
		} else {
			initialRequest.resolve(outcome);
		}
		await vi.advanceTimersByTimeAsync(0);

		expect(query.get()).toEqual(latestState);
		unsubscribe();
	});

	it("runs fetch callbacks for superseded requests", async () => {
		const initialRequest = Promise.withResolvers<Response>();
		const fetchImpl = vi
			.fn(async () => Response.json({ id: "current" }))
			.mockImplementationOnce(() => initialRequest.promise);
		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: fetchImpl,
		});
		const onSuccess = vi.fn();
		const onError = vi.fn();
		const query = useAuthQuery(atom(false), "/test", $fetch, {
			method: "GET",
			onSuccess,
			onError,
		});

		const unsubscribe = query.listen(() => {});
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchImpl).toHaveBeenCalledOnce();

		await query.get().refetch();
		initialRequest.resolve(
			Response.json({ message: "Unauthorized" }, { status: 401 }),
		);
		await vi.advanceTimersByTimeAsync(0);

		expect(onSuccess).toHaveBeenCalledOnce();
		expect(onError).toHaveBeenCalledOnce();
		unsubscribe();
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

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10015#discussion_r3400409998
	 */
	it("should clean up the equality gate when the query atom unmounts", async () => {
		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: async () => {
				return new Promise<Response>(() => {});
			},
		});

		const $signal = atom(false);
		const queryAtom = useAuthQuery<{ data: string }>($signal, "/test", $fetch, {
			method: "GET",
		});

		const unsubscribe = queryAtom.listen(() => {});
		await vi.advanceTimersByTimeAsync(0);
		const previousState = queryAtom.get();

		unsubscribe();
		await vi.advanceTimersByTimeAsync(1000);

		const equalState = { ...previousState };
		queryAtom.set(equalState);

		expect(queryAtom.get()).toBe(equalState);
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

	it("should not refetch a settled session request on a Suspense retry", async () => {
		vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
		let requestCount = 0;
		let resolveSessionRequest: ((response: Response) => void) | undefined;
		let resumeRender: (() => void) | undefined;
		let suspended = true;
		const suspendedRender = new Promise<void>((resolve) => {
			resumeRender = () => {
				suspended = false;
				resolve();
			};
		});
		const client = createReactAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl: async () => {
					requestCount++;
					if (requestCount > 1) {
						return new Response(JSON.stringify({ session: null, user: null }));
					}
					return new Promise<Response>((resolve) => {
						resolveSessionRequest = resolve;
					});
				},
			},
		});
		const SessionWatcher = () => {
			client.useSession();
			if (suspended) throw suspendedRender;
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

		const settleSessionRequest = resolveSessionRequest;
		if (!settleSessionRequest) throw new Error("Session request did not start");
		await act(async () =>
			settleSessionRequest(
				new Response(JSON.stringify({ session: null, user: null })),
			),
		);
		expect(client.$store.atoms.session!.value.isPending).toBe(false);

		const retrySuspendedRender = resumeRender;
		if (!retrySuspendedRender) {
			throw new Error("Suspense retry was not scheduled");
		}
		await act(async () => retrySuspendedRender());
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});

		expect(requestCount).toBe(1);

		await act(async () => root.unmount());
	});

	it("should retry a failed session request on remount", async () => {
		let fetchCount = 0;
		let resolveSessionRequest: ((response: Response) => void) | undefined;
		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: async () => {
				fetchCount++;
				if (fetchCount > 1) {
					return new Response(JSON.stringify({ session: null, user: null }));
				}
				return new Promise<Response>((resolve) => {
					resolveSessionRequest = resolve;
				});
			},
		});
		const { session } = getSessionAtom($fetch);

		const unsubscribeFirst = session.listen(() => {});
		await vi.advanceTimersByTimeAsync(0);
		unsubscribeFirst();
		await vi.advanceTimersByTimeAsync(STORE_UNMOUNT_DELAY);

		const settleSessionRequest = resolveSessionRequest;
		if (!settleSessionRequest) throw new Error("Session request did not start");
		settleSessionRequest(
			new Response(JSON.stringify({ message: "Internal Server Error" }), {
				status: 500,
			}),
		);
		await Promise.resolve();

		const unsubscribeSecond = session.listen(() => {});
		await vi.advanceTimersByTimeAsync(0);

		expect(fetchCount).toBe(2);
		unsubscribeSecond();
	});

	it("should retry an incomplete session refresh on remount", async () => {
		const methods: string[] = [];
		let resolveSessionRequest: ((response: Response) => void) | undefined;
		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: async (_url, init) => {
				const method = init?.method ?? "GET";
				methods.push(method);
				if (methods.length === 1) {
					return new Promise<Response>((resolve) => {
						resolveSessionRequest = resolve;
					});
				}
				if (method === "POST") throw new Error("Session refresh failed");
				return new Response(JSON.stringify({ session: null, user: null }));
			},
		});
		const { session } = getSessionAtom($fetch);

		const unsubscribeFirst = session.listen(() => {});
		await vi.advanceTimersByTimeAsync(0);
		unsubscribeFirst();
		await vi.advanceTimersByTimeAsync(STORE_UNMOUNT_DELAY);

		const settleSessionRequest = resolveSessionRequest;
		if (!settleSessionRequest) throw new Error("Session request did not start");
		settleSessionRequest(
			new Response(
				JSON.stringify({
					needsRefresh: true,
					session: {
						id: "session-1",
						expiresAt: new Date(Date.now() + 60_000),
					},
					user: { id: "user-1" },
				}),
			),
		);
		await vi.advanceTimersByTimeAsync(0);
		expect(session.value.data?.session.id).toBe("session-1");

		const unsubscribeSecond = session.listen(() => {});
		await vi.advanceTimersByTimeAsync(0);

		expect(methods).toEqual(["GET", "POST", "GET"]);
		unsubscribeSecond();
	});

	it("should revalidate after the session signal changes", async () => {
		let fetchCount = 0;
		let resolveSessionRequest: ((response: Response) => void) | undefined;
		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: async () => {
				fetchCount++;
				if (fetchCount > 1) {
					return new Response(JSON.stringify({ session: null, user: null }));
				}
				return new Promise<Response>((resolve) => {
					resolveSessionRequest = resolve;
				});
			},
		});
		const { $sessionSignal, session } = getSessionAtom($fetch);

		const unsubscribeFirst = session.listen(() => {});
		await vi.advanceTimersByTimeAsync(0);
		unsubscribeFirst();
		await vi.advanceTimersByTimeAsync(STORE_UNMOUNT_DELAY);

		const settleSessionRequest = resolveSessionRequest;
		if (!settleSessionRequest) throw new Error("Session request did not start");
		settleSessionRequest(
			new Response(JSON.stringify({ session: null, user: null })),
		);
		await Promise.resolve();
		$sessionSignal.set(!$sessionSignal.get());

		const unsubscribeSecond = session.listen(() => {});
		await vi.advanceTimersByTimeAsync(0);

		expect(fetchCount).toBe(2);
		unsubscribeSecond();
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

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11160
	 */
	it("should not abort in-flight session request or discard its response on session signal refetch", async () => {
		let fetchCount = 0;
		let resolveFirstRequest: ((response: Response) => void) | undefined;
		let resolveSecondRequest: ((response: Response) => void) | undefined;
		const observedAborts: boolean[] = [];

		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: async (_url, init) => {
				fetchCount++;
				const signal = init?.signal as AbortSignal | undefined;
				if (fetchCount === 1) {
					return new Promise<Response>((resolve) => {
						signal?.addEventListener("abort", () => {
							observedAborts.push(true);
						});
						resolveFirstRequest = resolve;
					});
				}
				return new Promise<Response>((resolve) => {
					resolveSecondRequest = resolve;
				});
			},
		});

		const { $sessionSignal, session } = getSessionAtom($fetch);
		const unsubscribe = session.listen(() => {});
		await vi.advanceTimersByTimeAsync(0);

		expect(fetchCount).toBe(1);

		$sessionSignal.set(!$sessionSignal.get());
		// After damping delay fires, second fetch is queued behind in-flight — not
		// launched concurrently.
		await vi.advanceTimersByTimeAsync(SIGNAL_REFETCH_DAMP_MS);
		expect(fetchCount).toBe(1);

		const settleFirst = resolveFirstRequest;
		if (!settleFirst) throw new Error("First session request did not start");
		settleFirst(
			new Response(
				JSON.stringify({
					session: {
						id: "session-1",
						expiresAt: new Date(Date.now() + 60_000),
					},
					user: { id: "user-1", email: "test@example.com" },
				}),
			),
		);
		await vi.advanceTimersByTimeAsync(0);

		// The first flight is NOT aborted (no abort observed), but its response
		// is not written because the revision guard detects that sessionRevision
		// advanced since this flight started (Fix 1). The second fetch should now
		// be in-flight.
		expect(observedAborts).toEqual([]);
		expect(fetchCount).toBe(2);
		// Data must still be null/pending — the stale first-flight response is discarded.
		expect(session.value.data).toBeNull();

		const settleSecond = resolveSecondRequest;
		if (!settleSecond) throw new Error("Second session request did not start");
		settleSecond(
			new Response(
				JSON.stringify({
					session: {
						id: "session-2",
						expiresAt: new Date(Date.now() + 60_000),
					},
					user: { id: "user-1", email: "test@example.com" },
				}),
			),
		);
		await vi.advanceTimersByTimeAsync(0);

		expect(fetchCount).toBe(2);
		expect(observedAborts).toEqual([]);
		expect(session.value.data?.session.id).toBe("session-2");

		unsubscribe();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11160
	 */
	it("should not write stale session data when flight finishes after sessionRevision incremented", async () => {
		let resolveFirstRequest: ((response: Response) => void) | undefined;

		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: async (_url, init) => {
				const method = (init as RequestInit | undefined)?.method ?? "GET";
				if (method === "GET" && !resolveFirstRequest) {
					return new Promise<Response>((resolve) => {
						resolveFirstRequest = resolve;
					});
				}
				// Second fetch (post-signal) returns a new session
				return new Response(
					JSON.stringify({
						session: { id: "session-new" },
						user: { id: "user-1" },
					}),
				);
			},
		});

		const { $sessionSignal, session } = getSessionAtom($fetch);
		const unsubscribe = session.listen(() => {});
		await vi.advanceTimersByTimeAsync(0);

		// First fetch is in-flight. Signal increment (sign-out / user switch)
		// bumps sessionRevision before the first flight resolves.
		$sessionSignal.set(!$sessionSignal.get());
		await vi.advanceTimersByTimeAsync(SIGNAL_REFETCH_DAMP_MS);

		// Resolve the stale first request AFTER the revision has been bumped.
		const settleStale = resolveFirstRequest;
		if (!settleStale) throw new Error("First session request did not start");
		settleStale(
			new Response(
				JSON.stringify({
					session: { id: "session-stale" },
					user: { id: "user-1" },
				}),
			),
		);
		// Let the second (post-signal) fetch also complete.
		await vi.runAllTimersAsync();

		// Stale response must NOT have been written; only the post-signal response
		// should be visible.
		expect(session.value.data?.session.id).not.toBe("session-stale");
		expect(session.value.data?.session.id).toBe("session-new");

		unsubscribe();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11160
	 */
	it("should clear pending nextFlight when explicit refetch (cancelInFlight) is called", async () => {
		let fetchCount = 0;
		const requests: Array<(response: Response) => void> = [];

		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: async () => {
				fetchCount++;
				return new Promise<Response>((resolve) => {
					requests.push(resolve);
				});
			},
		});

		const { $sessionSignal, session } = getSessionAtom($fetch);
		const unsubscribe = session.listen(() => {});
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchCount).toBe(1);

		// Signal queues a nextFlight behind the in-flight request.
		$sessionSignal.set(!$sessionSignal.get());
		await vi.advanceTimersByTimeAsync(SIGNAL_REFETCH_DAMP_MS);
		// At this point the nextFlight is queued but the first fetch still pending.

		// Explicit refetch (cancelInFlight=true) should clear nextFlight and abort
		// the current in-flight, then start a new fetch itself.
		const refetchPromise = session.value.refetch();
		await vi.advanceTimersByTimeAsync(0);

		// Settle all outstanding fetches.
		for (const resolve of requests) {
			resolve(
				new Response(
					JSON.stringify({ session: { id: "session-x" }, user: { id: "u1" } }),
				),
			);
		}
		await refetchPromise;
		await vi.runAllTimersAsync();

		// After the explicit refetch completes, no redundant nextFlight-driven fetch
		// should have fired. fetchCount should be exactly 2: initial + explicit
		// refetch (not 3 with a redundant nextFlight fetch).
		expect(fetchCount).toBe(2);

		unsubscribe();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11160
	 */
	it("should spawn a follow-up fetch for queued nextFlight when revision changed since the in-flight request", async () => {
		let fetchCount = 0;
		let resolveInFlight: ((response: Response) => void) | undefined;

		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: async (_url, init) => {
				fetchCount++;
				const method = (init as RequestInit | undefined)?.method ?? "GET";
				// Only the first signal-triggered fetch stalls; subsequent ones resolve
				// immediately.
				if (method === "GET" && fetchCount === 2) {
					return new Promise<Response>((resolve) => {
						resolveInFlight = resolve;
					});
				}
				return new Response(
					JSON.stringify({
						session: { id: "session-fresh" },
						user: { id: "u1" },
					}),
				);
			},
		});

		const { $sessionSignal, session } = getSessionAtom($fetch);
		const unsubscribe = session.listen(() => {});

		// Let mount fetch (#1) complete immediately.
		await vi.runAllTimersAsync();
		expect(fetchCount).toBe(1);

		// Signal #1 triggers flight #2 (which stalls) with revision=1.
		$sessionSignal.set(!$sessionSignal.get());
		await vi.advanceTimersByTimeAsync(SIGNAL_REFETCH_DAMP_MS);
		expect(fetchCount).toBe(2);

		// Signal #2 bumps revision to 2 and queues a nextFlight behind flight #2.
		$sessionSignal.set(!$sessionSignal.get());
		await vi.advanceTimersByTimeAsync(SIGNAL_REFETCH_DAMP_MS);
		// Still only 2 fetches — nextFlight is queued, not yet started.
		expect(fetchCount).toBe(2);

		// Resolve stale flight #2 (revision=1, current=2) — data must not be
		// written, and settleFlight must spawn fetch #3 to satisfy nextFlight.
		const settle = resolveInFlight;
		if (!settle) throw new Error("Stalled session fetch did not start");
		settle(
			new Response(
				JSON.stringify({
					session: { id: "session-stale" },
					user: { id: "u1" },
				}),
			),
		);
		await vi.runAllTimersAsync();

		// Fetch #3 is the nextFlight follow-up; it resolves with "session-fresh".
		expect(fetchCount).toBe(3);
		expect(session.value.data?.session.id).toBe("session-fresh");
		// Stale data from flight #2 must never be visible.
		expect(session.value.data?.session.id).not.toBe("session-stale");

		unsubscribe();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11160
	 */
	it("should abort stalled in-flight session request after timeout and unblock queued refresh", async () => {
		let fetchCount = 0;
		const observedAborts: boolean[] = [];

		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: async (_url, init) => {
				fetchCount++;
				const signal = init?.signal as AbortSignal | undefined;
				if (fetchCount === 1) {
					// Flight 1 stalls indefinitely.
					return new Promise<Response>((_resolve, reject) => {
						signal?.addEventListener("abort", () => {
							observedAborts.push(true);
							reject(
								new DOMException("The operation was aborted.", "AbortError"),
							);
						});
					});
				}
				// Flight 2 (the queued refresh) succeeds immediately.
				return new Response(
					JSON.stringify({
						session: { id: "session-unblocked" },
						user: { id: "u1" },
					}),
				);
			},
		});

		const { $sessionSignal, session } = getSessionAtom($fetch);
		const unsubscribe = session.listen(() => {});
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchCount).toBe(1);

		// Signal queues flight 2 behind the stalled flight 1.
		$sessionSignal.set(!$sessionSignal.get());
		await vi.advanceTimersByTimeAsync(SIGNAL_REFETCH_DAMP_MS);
		expect(fetchCount).toBe(1);

		// Advance time by the fallback timeout to trigger timeout abort.
		await vi.advanceTimersByTimeAsync(SESSION_FETCH_TIMEOUT_MS);

		// Stalled flight 1 was aborted by timeout.
		expect(observedAborts).toEqual([true]);

		// Queued refresh (flight 2) was unblocked and ran to completion.
		await vi.runAllTimersAsync();
		expect(fetchCount).toBe(2);
		expect(session.value.data?.session.id).toBe("session-unblocked");

		unsubscribe();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11160
	 */
	it("should resolve redundant queued flight immediately if active flight completed fresh with matching revision and query params", async () => {
		let fetchCount = 0;
		const requests: Array<(response: Response) => void> = [];

		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: async () => {
				fetchCount++;
				return new Promise<Response>((resolve) => {
					requests.push(resolve);
				});
			},
		});

		const { session } = getSessionAtom($fetch);
		const unsubscribe = session.listen(() => {});

		// Mount fetch starts with queryParams: undefined
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchCount).toBe(1);

		// Settle mount fetch first so we start from an idle atom state
		const settleMount = requests.shift();
		if (!settleMount) throw new Error("Mount fetch did not start");
		settleMount(
			new Response(
				JSON.stringify({
					session: { id: "session-mount" },
					user: { id: "u1" },
				}),
			),
		);
		await vi.runAllTimersAsync();
		expect(fetchCount).toBe(1);

		// Start in-flight request with custom queryParams
		const queryA = { query: { disableCookieCache: false } };
		const queryB = { query: { disableCookieCache: true } };

		void session.value.refetch(queryA);
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchCount).toBe(2);

		// Queue a flight with differing queryParams (creates nextFlight)
		const queuedPromise1 = session.value.refetch(queryB, {
			cancelInFlight: false,
		});
		// Update queued flight to match the active flight's queryParams
		const queuedPromise2 = session.value.refetch(queryA, {
			cancelInFlight: false,
		});

		// Neither queued request should have launched concurrently
		expect(fetchCount).toBe(2);

		// Resolve in-flight request fresh with matching revision and queryParams
		const settleActive = requests.shift();
		if (!settleActive) throw new Error("Active fetch did not start");
		settleActive(
			new Response(
				JSON.stringify({
					session: { id: "session-fresh" },
					user: { id: "u1" },
				}),
			),
		);

		await Promise.all([queuedPromise1, queuedPromise2]);
		await vi.runAllTimersAsync();

		// Redundant nextFlight was resolved directly by settleFlight without a 3rd fetch
		expect(fetchCount).toBe(2);
		expect(session.value.data?.session.id).toBe("session-fresh");
		expect(session.value.isRefetching).toBe(false);

		unsubscribe();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11160
	 */
	it("should reset isRefetching and isPending to false when a lone flight times out or aborts without queued flight", async () => {
		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: async (_url, init) => {
				const signal = init?.signal as AbortSignal | undefined;
				return new Promise<Response>((_resolve, reject) => {
					signal?.addEventListener("abort", () => {
						reject(
							new DOMException("The operation was aborted.", "AbortError"),
						);
					});
				});
			},
		});

		const { session } = getSessionAtom($fetch);
		const query = session;
		const unsubscribe = session.listen(() => {});

		// Mount fetch starts
		await vi.advanceTimersByTimeAsync(0);
		expect(session.value.isPending).toBe(true);
		expect(session.value.isRefetching).toBe(true);

		// Advance time by SESSION_FETCH_TIMEOUT_MS to trigger timeout abort
		await vi.advanceTimersByTimeAsync(SESSION_FETCH_TIMEOUT_MS);
		await vi.runAllTimersAsync();

		// Session should NOT be stuck in loading/refetching
		expect(session.value.isRefetching).toBe(false);
		expect(session.value.isPending).toBe(false);
		expect(query.value.error?.name).toBe("BetterFetchError");
		expect(query.value.error?.status).toBe(408);
		expect(query.value.error?.statusText).toBe("Request Timeout");

		unsubscribe();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11160
	 */
	it("should provide independent timeout deadline for session refresh POST request", async () => {
		let getCount = 0;
		let postCount = 0;

		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: async (_url, init) => {
				const method = (init?.method ?? "GET").toUpperCase();
				const signal = init?.signal as AbortSignal | undefined;
				if (method === "GET") {
					getCount++;
					// GET takes 8 seconds (less than 10s timeout)
					return new Promise<Response>((resolve, reject) => {
						const timer = setTimeout(() => {
							resolve(
								new Response(
									JSON.stringify({
										session: { id: "s1" },
										user: { id: "u1" },
										needsRefresh: true,
									}),
								),
							);
						}, 8000);
						signal?.addEventListener("abort", () => {
							clearTimeout(timer);
							reject(
								new DOMException("The operation was aborted.", "AbortError"),
							);
						});
					});
				}
				postCount++;
				// POST refresh takes 5 seconds (total elapsed = 13s > 10s single timer)
				return new Promise<Response>((resolve, reject) => {
					const timer = setTimeout(() => {
						resolve(
							new Response(
								JSON.stringify({
									session: { id: "s1-refreshed" },
									user: { id: "u1" },
								}),
							),
						);
					}, 5000);
					signal?.addEventListener("abort", () => {
						clearTimeout(timer);
						reject(
							new DOMException("The operation was aborted.", "AbortError"),
						);
					});
				});
			},
		});

		const { session } = getSessionAtom($fetch);
		const unsubscribe = session.listen(() => {});

		// Mount fetch starts
		await vi.advanceTimersByTimeAsync(0);
		expect(getCount).toBe(1);

		// Advance 8s for GET to finish and trigger POST refresh
		await vi.advanceTimersByTimeAsync(8000);
		expect(postCount).toBe(1);

		// Advance another 5s for POST refresh to complete (total 13s)
		await vi.advanceTimersByTimeAsync(5000);
		await vi.runAllTimersAsync();

		expect(session.value.data?.session.id).toBe("s1-refreshed");
		expect(session.value.isRefetching).toBe(false);
		expect(session.value.error).toBeNull();

		unsubscribe();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11160
	 */
	it("should abort and respect opts.timeout in useAuthQuery", async () => {
		let fetchStarted = false;
		let aborted = false;

		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: async (_url, init) => {
				fetchStarted = true;
				const signal = init?.signal as AbortSignal | undefined;
				return new Promise<Response>((resolve, reject) => {
					const timer = setTimeout(() => {
						resolve(new Response(JSON.stringify({ ok: true })));
					}, 2000);
					signal?.addEventListener("abort", () => {
						clearTimeout(timer);
						aborted = true;
						reject(
							signal.reason ??
								new DOMException("The operation was aborted.", "AbortError"),
						);
					});
				});
			},
		});

		const $signal = atom(false);
		const query = useAuthQuery<{ ok: boolean }>($signal, "/test", $fetch, {
			timeout: 500,
		});
		const unsubscribe = query.listen(() => {});

		await vi.advanceTimersByTimeAsync(0);
		expect(fetchStarted).toBe(true);

		// Advance past timeout (500ms)
		await vi.advanceTimersByTimeAsync(500);
		await vi.runAllTimersAsync();

		expect(aborted).toBe(true);
		expect(query.value.isPending).toBe(false);
		expect(query.value.isRefetching).toBe(false);
		expect(query.value.error).not.toBeNull();

		unsubscribe();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11160
	 */
	it("should not classify real failed requests as 408 Request Timeout", async () => {
		let is500 = false;
		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: async () => {
				if (is500) {
					return new Response(JSON.stringify({ message: "Server error" }), {
						status: 500,
						statusText: "Internal Server Error",
					});
				}
				throw new TypeError("Failed to fetch");
			},
		});

		const { session } = getSessionAtom($fetch);
		const unsubscribe = session.listen(() => {});

		// Mount fetch starts and fails with TypeError
		await vi.advanceTimersByTimeAsync(0);
		await vi.runAllTimersAsync();

		// Real network failure should report the actual error, never a fabricated 408 Request Timeout
		expect(session.value.isRefetching).toBe(false);
		expect(session.value.isPending).toBe(false);
		expect(session.value.error).not.toBeNull();
		expect(session.value.error?.status).not.toBe(408);
		expect(session.value.error?.message).not.toContain("Request Timeout");

		// Refetch fails with HTTP 500
		is500 = true;
		await session.value.refetch();
		await vi.runAllTimersAsync();

		// Real 500 failure should report 500, never a fabricated 408 Request Timeout
		expect(session.value.isRefetching).toBe(false);
		expect(session.value.isPending).toBe(false);
		expect(session.value.error).not.toBeNull();
		expect(session.value.error?.status).toBe(500);
		expect(session.value.error?.status).not.toBe(408);
		expect(session.value.error?.statusText).not.toBe("Request Timeout");

		unsubscribe();
	});
});
