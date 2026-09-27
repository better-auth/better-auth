import type { BetterAuthClientOptions } from "@better-auth/core";
import type { BetterFetch } from "@better-fetch/fetch";
import { BetterFetchError } from "@better-fetch/fetch";
import { atom, onMount, STORE_UNMOUNT_DELAY } from "nanostores";
import type { Session, User } from "../types";
import { isJsonEqual, withEquality } from "./equality";
import type { AuthQueryAtom, AuthQueryState } from "./query";
import { createAuthQueryAtom } from "./query-atom";
import { createSessionRefreshManager } from "./session-refresh";
import type { SessionQueryParams } from "./types";

// SSR detection
const isServer = () => typeof window === "undefined";

// Align session request reuse with the nanostores's remount lifecycle.
const SESSION_MOUNT_DEDUPE_INTERVAL = STORE_UNMOUNT_DELAY;

/**
 * Fallback timeout to abort stalled in-flight session requests and unblock queued refreshes.
 */
export const SESSION_FETCH_TIMEOUT_MS = 10000;

export type SessionData = {
	user: User;
	session: Session;
} & Record<string, any>;

export type SessionAtom = AuthQueryAtom<SessionData>;

export function hydrateSessionAtom(
	sessionAtom: SessionAtom,
	session: SessionData | null,
) {
	// The client is a module-level singleton, so writing during SSR would leak
	// one request's session into concurrent requests sharing the same process.
	if (typeof window === "undefined") {
		return;
	}
	const currentSession = sessionAtom.get();
	if (currentSession.data !== null || session === null) {
		return;
	}
	sessionAtom.set({
		...currentSession,
		data: session,
		error: null,
		isPending: false,
	});
}

type SessionResponse = (
	| { session: null; user: null; needsRefresh?: boolean }
	| { session: Session; user: User; needsRefresh?: boolean }
) &
	Record<string, any>;

type SessionFetchOutcome = "aborted" | "failed" | "stale" | "fresh";

type SessionFetchResult = {
	outcome: SessionFetchOutcome;
	error?: BetterFetchError | null;
};

type SessionFlight = {
	cancel: () => void;
	promise: Promise<SessionFetchResult>;
	revision: number;
	queryParams?: { query?: SessionQueryParams } | undefined;
};

/**
 * Normalize $fetch response: `throw: true` returns data directly,
 * otherwise `{ data, error }`.
 */
function normalizeSessionResponse(res: unknown): {
	data: SessionResponse | null;
	error: unknown;
} {
	if (
		typeof res === "object" &&
		res !== null &&
		"data" in res &&
		"error" in res
	) {
		return res as { data: SessionResponse | null; error: unknown };
	}
	return { data: res as SessionResponse, error: null };
}

function normalizeSessionData(
	data: SessionResponse | null,
): SessionData | null {
	if (!data) return null;
	if (data.session === null && data.user === null) return null;
	return data as SessionData;
}

function isSessionAtomEqual(
	a: AuthQueryState<SessionData>,
	b: AuthQueryState<SessionData>,
): boolean {
	return (
		isJsonEqual(a.data, b.data) &&
		a.error === b.error &&
		a.isPending === b.isPending &&
		a.isRefetching === b.isRefetching &&
		a.refetch === b.refetch
	);
}

export function getSessionAtom(
	$fetch: BetterFetch,
	options?: BetterAuthClientOptions | undefined,
) {
	const $signal = atom<boolean>(false);

	let flight: SessionFlight | undefined;
	let nextFlight:
		| {
				promise: Promise<void>;
				resolve: () => void;
				reject: (err: unknown) => void;
				queryParams?: { query?: SessionQueryParams } | undefined;
		  }
		| undefined;
	let freshUntil = 0;
	let sessionRevision = 0;
	$signal.listen(() => {
		sessionRevision++;
		freshUntil = 0;
	});

	const refetch = (
		queryParams?: { query?: SessionQueryParams } | undefined,
		fetchOpts?: { cancelInFlight?: boolean } | undefined,
	): Promise<void> =>
		fetchSession(queryParams, {
			cancelInFlight: fetchOpts?.cancelInFlight ?? true,
		});

	const session: SessionAtom = createAuthQueryAtom<AuthQueryState<SessionData>>(
		{
			data: null,
			error: null,
			isPending: true,
			isRefetching: false,
			refetch,
		},
	);
	withEquality(session, isSessionAtomEqual);

	const executeSessionFetch = async (
		controller: AbortController,
		revision: number,
		queryParams?: { query?: SessionQueryParams } | undefined,
	): Promise<SessionFetchResult> => {
		const signal = controller.signal;
		const current = session.value;
		session.set({
			...current,
			isPending: current.data === null,
			isRefetching: true,
			error: null,
			refetch,
		});
		if (signal.aborted) return { outcome: "aborted" };

		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		const armTimeout = () => {
			if (timeoutId) clearTimeout(timeoutId);
			if (typeof setTimeout !== "undefined") {
				timeoutId = setTimeout(() => {
					controller.abort();
				}, SESSION_FETCH_TIMEOUT_MS);
			}
		};

		const abortPromise = new Promise<never>((_, reject) => {
			if (signal.aborted) {
				reject(signal.reason ?? new Error("The operation was aborted."));
				return;
			}
			signal.addEventListener(
				"abort",
				() => reject(signal.reason ?? new Error("The operation was aborted.")),
				{ once: true },
			);
		});

		try {
			armTimeout();
			const res = await Promise.race([
				$fetch<SessionResponse>("/get-session", {
					method: "GET",
					query: queryParams?.query,
					signal,
					timeout: SESSION_FETCH_TIMEOUT_MS,
				}),
				abortPromise,
			]);
			if (signal.aborted) {
				return { outcome: "aborted" };
			}

			let { data, error } = normalizeSessionResponse(res);
			let outcome: SessionFetchOutcome = "fresh";

			if (data?.needsRefresh) {
				try {
					armTimeout();
					const refreshRes = await Promise.race([
						$fetch<SessionResponse>("/get-session", {
							method: "POST",
							signal,
							timeout: SESSION_FETCH_TIMEOUT_MS,
						}),
						abortPromise,
					]);
					if (signal.aborted) {
						return { outcome: "aborted" };
					}
					({ data, error } = normalizeSessionResponse(refreshRes));
				} catch {
					if (signal.aborted) {
						return { outcome: "aborted" };
					}
					outcome = "stale";
				}
			}

			// Guard: if auth changed while we were in-flight, skip write but let
			// settleFlight drain nextFlight. Only skip the data write — not the
			// return value, so the caller can still resolve queued nextFlight.
			if (revision !== sessionRevision) {
				return { outcome: outcome === "fresh" ? "stale" : outcome };
			}

			if (error) {
				const latest = session.value;
				const isUnauthorized = (error as BetterFetchError)?.status === 401;
				session.set({
					data: isUnauthorized ? null : latest.data,
					error: error as BetterFetchError,
					isPending: false,
					isRefetching: Boolean(nextFlight),
					refetch,
				});
				return { outcome: "failed", error: error as BetterFetchError };
			}

			const sessionData = normalizeSessionData(data);
			const current = session.value;
			const stableData =
				current.data != null &&
				sessionData != null &&
				isJsonEqual(current.data, sessionData)
					? current.data
					: sessionData;
			session.set({
				data: stableData as SessionData | null,
				error: null,
				isPending: false,
				isRefetching: Boolean(nextFlight),
				refetch,
			});
			return { outcome };
		} catch (fetchError) {
			if (signal.aborted) {
				return { outcome: "aborted" };
			}
			if (revision !== sessionRevision) {
				return { outcome: "failed", error: fetchError as BetterFetchError };
			}
			const latest = session.value;
			session.set({
				data: latest.data,
				error: fetchError as BetterFetchError,
				isPending: false,
				isRefetching: Boolean(nextFlight),
				refetch,
			});
			return { outcome: "failed", error: fetchError as BetterFetchError };
		} finally {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
		}
	};

	const getFreshUntil = (): number => {
		const expiresAt = session.value.data?.session?.expiresAt;
		// Treat missing expiry as unbounded so Math.min picks the dedupe deadline.
		const sessionExpiresAt =
			expiresAt instanceof Date
				? expiresAt.getTime()
				: Number.POSITIVE_INFINITY;
		return Math.min(
			Date.now() + SESSION_MOUNT_DEDUPE_INTERVAL,
			sessionExpiresAt,
		);
	};

	const fetchSession = (
		queryParams?: { query?: SessionQueryParams } | undefined,
		fetchOpts?: { cancelInFlight?: boolean } | undefined,
	): Promise<void> => {
		freshUntil = 0;

		if (flight && !fetchOpts?.cancelInFlight) {
			if (
				flight.revision === sessionRevision &&
				isJsonEqual(flight.queryParams ?? null, queryParams ?? null) &&
				!nextFlight
			) {
				return flight.promise.then(() => undefined);
			}
			if (!nextFlight) {
				let resolve!: () => void;
				let reject!: (err: unknown) => void;
				const promise = new Promise<void>((res, rej) => {
					resolve = res;
					reject = rej;
				});
				nextFlight = {
					promise,
					resolve,
					reject,
					queryParams,
				};
			} else if (queryParams) {
				nextFlight.queryParams = queryParams;
			}
			return nextFlight.promise;
		}

		if (fetchOpts?.cancelInFlight) {
			if (nextFlight) {
				nextFlight.resolve();
				nextFlight = undefined;
			}
			flight?.cancel();
		}

		const controller = new AbortController();
		const capturedRevision = sessionRevision;
		const promise = Promise.resolve().then(() => {
			if (controller.signal.aborted) return { outcome: "aborted" as const };
			return executeSessionFetch(controller, capturedRevision, queryParams);
		});
		const request: SessionFlight = {
			cancel: () => controller.abort(),
			promise,
			revision: capturedRevision,
			queryParams,
		};
		flight = request;
		const settleFlight = (
			outcome: SessionFetchOutcome,
			error?: BetterFetchError | null,
		) => {
			if (flight !== request) return;
			flight = undefined;
			if (!nextFlight) {
				if (outcome === "fresh" && request.revision === sessionRevision) {
					freshUntil = getFreshUntil();
				}
				const current = session.value;
				if (current.isRefetching || current.isPending) {
					const resolvedError =
						outcome === "aborted"
							? (current.error ??
								new BetterFetchError(
									408,
									"Request Timeout",
									"The session request timed out or was aborted",
								))
							: (error ?? current.error);
					session.set({
						...current,
						isRefetching: false,
						isPending: false,
						error: resolvedError,
					});
				}
			}
			if (nextFlight) {
				const queued = nextFlight;
				nextFlight = undefined;
				if (
					outcome === "fresh" &&
					request.revision === sessionRevision &&
					isJsonEqual(request.queryParams ?? null, queued.queryParams ?? null)
				) {
					freshUntil = getFreshUntil();
					const latest = session.value;
					if (latest.isRefetching) {
						session.set({
							...latest,
							isRefetching: false,
						});
					}
					queued.resolve();
				} else {
					fetchSession(queued.queryParams).then(queued.resolve, queued.reject);
				}
			}
		};
		void request.promise.then(
			(result) => settleFlight(result.outcome, result.error),
			(err) => settleFlight("failed", err as BetterFetchError),
		);
		return request.promise.then(() => undefined);
	};

	const fetchSessionOnMount = (): Promise<void> => {
		if (flight?.revision === sessionRevision) {
			return flight.promise.then(() => undefined);
		}
		if (Date.now() < freshUntil) return Promise.resolve();
		return fetchSession();
	};

	let broadcastSessionUpdate: (
		trigger: "signout" | "getSession" | "updateUser",
	) => void = () => {};

	onMount(session, () => {
		let timeoutId: ReturnType<typeof setTimeout> | undefined;

		if (!isServer()) {
			timeoutId = setTimeout(() => {
				void fetchSessionOnMount();
			}, 0);
		}

		const refreshManager = createSessionRefreshManager({
			fetchSession: () => fetchSession(),
			shouldPollSession: () => session.value.data != null,
			sessionSignal: $signal,
			options,
		});
		refreshManager.init();
		broadcastSessionUpdate = refreshManager.broadcastSessionUpdate;

		return () => {
			if (timeoutId) clearTimeout(timeoutId);
			refreshManager.cleanup();
		};
	});

	return {
		session,
		$sessionSignal: $signal,
		broadcastSessionUpdate: (
			trigger: "signout" | "getSession" | "updateUser",
		) => broadcastSessionUpdate(trigger),
	};
}
