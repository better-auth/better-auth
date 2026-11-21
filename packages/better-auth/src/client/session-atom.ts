import type { BetterAuthClientOptions } from "@better-auth/core";
import type { BetterFetch, BetterFetchError } from "@better-fetch/fetch";
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

type SessionFlight = {
	cancel: () => void;
	promise: Promise<SessionFetchOutcome>;
	revision: number;
};

/**
 * Normalize $fetch response: `throw: true` returns data directly,
 * otherwise `{ data, error }`. `throws` is the request's effective `throw`
 * option when a successful response reported it; without it the shape is
 * inferred from the result.
 */
function normalizeSessionResponse(
	res: unknown,
	throws?: boolean | undefined,
): {
	data: SessionResponse | null;
	error: unknown;
} {
	if (throws === true) {
		return { data: res as SessionResponse, error: null };
	}
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

/**
 * `/get-session` answers with a session object or `null`. A non-object body, such as
 * an HTML page that a SPA fallback, reverse proxy or CDN served with `200`, is not a
 * session, even though the request succeeded.
 */
export function isSessionPayload(data: unknown): boolean {
	return data == null || (typeof data === "object" && !Array.isArray(data));
}

/**
 * The error returned in place of a `/get-session` body that is not a session, shaped
 * like the errors `$fetch` returns for failed responses.
 */
export function createInvalidSessionPayloadError(
	status: number,
	statusText: string,
) {
	return {
		status,
		statusText,
		message:
			"Invalid response from /get-session: expected a session object or null. Check that the auth base URL reaches the Better Auth handler.",
	};
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
	let freshUntil = 0;
	let sessionRevision = 0;
	$signal.listen(() => {
		sessionRevision++;
		freshUntil = 0;
	});

	const refetch = (
		queryParams?: { query?: SessionQueryParams } | undefined,
	): Promise<void> => fetchSession(queryParams);

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
		signal: AbortSignal,
		queryParams?: { query?: SessionQueryParams } | undefined,
	): Promise<SessionFetchOutcome> => {
		const current = session.value;
		session.set({
			...current,
			isPending: current.data === null,
			isRefetching: true,
			error: null,
			refetch,
		});
		if (signal.aborted) return "aborted";

		let responseStatus = 200;
		let responseStatusText = "";
		let responseThrows: boolean | undefined;
		const recordResponse = (context: {
			response?: Response | undefined;
			request?: { throw?: boolean | undefined } | undefined;
		}) => {
			if (context.response) {
				responseStatus = context.response.status;
				responseStatusText = context.response.statusText;
				responseThrows = context.request?.throw === true;
			}
		};
		const rejectNonSessionPayload = (result: {
			data: SessionResponse | null;
			error: unknown;
		}): { data: SessionResponse | null; error: unknown } =>
			result.error || isSessionPayload(result.data)
				? result
				: {
						data: null,
						error: createInvalidSessionPayloadError(
							responseStatus,
							responseStatusText,
						),
					};

		try {
			const res = await $fetch<SessionResponse>("/get-session", {
				method: "GET",
				query: queryParams?.query,
				signal,
				onSuccess: recordResponse,
			});
			if (signal.aborted) {
				return "aborted";
			}

			let { data, error } = rejectNonSessionPayload(
				normalizeSessionResponse(res, responseThrows),
			);
			let outcome: SessionFetchOutcome = "fresh";

			if (data?.needsRefresh) {
				try {
					const refreshRes = await $fetch<SessionResponse>("/get-session", {
						method: "POST",
						body: {},
						signal,
						onSuccess: recordResponse,
					});
					if (signal.aborted) {
						return "aborted";
					}
					({ data, error } = rejectNonSessionPayload(
						normalizeSessionResponse(refreshRes, responseThrows),
					));
				} catch {
					if (signal.aborted) {
						return "aborted";
					}
					outcome = "stale";
				}
			}

			if (error) {
				const latest = session.value;
				const isUnauthorized = (error as BetterFetchError)?.status === 401;
				session.set({
					data: isUnauthorized ? null : latest.data,
					error: error as BetterFetchError,
					isPending: false,
					isRefetching: false,
					refetch,
				});
				return "failed";
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
				isRefetching: false,
				refetch,
			});
			return outcome;
		} catch (fetchError) {
			if (signal.aborted) {
				return "aborted";
			}
			const latest = session.value;
			session.set({
				data: latest.data,
				error: fetchError as BetterFetchError,
				isPending: false,
				isRefetching: false,
				refetch,
			});
			return "failed";
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
	): Promise<void> => {
		freshUntil = 0;
		flight?.cancel();
		const controller = new AbortController();
		const promise = Promise.resolve().then(() => {
			if (controller.signal.aborted) return "aborted" as const;
			return executeSessionFetch(controller.signal, queryParams);
		});
		const request: SessionFlight = {
			cancel: () => controller.abort(),
			promise,
			revision: sessionRevision,
		};
		flight = request;
		const settleFlight = (outcome: SessionFetchOutcome) => {
			if (flight !== request) return;
			flight = undefined;
			if (outcome === "fresh" && request.revision === sessionRevision) {
				freshUntil = getFreshUntil();
			}
		};
		void request.promise.then(settleFlight, () => settleFlight("failed"));
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
			fetchSession,
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
