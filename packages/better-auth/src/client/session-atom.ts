import type { BetterAuthClientOptions } from "@better-auth/core";
import type { BetterFetch, BetterFetchError } from "@better-fetch/fetch";
import { atom, onMount } from "nanostores";
import type { Session, User } from "../types";
import { isJsonEqual, withEquality } from "./equality";
import type { AuthQueryAtom, AuthQueryState } from "./query";
import { createSessionRefreshManager } from "./session-refresh";
import type { SessionQueryParams } from "./types";

// SSR detection
const isServer = () => typeof window === "undefined";

export type SessionAtom = AuthQueryAtom<{
	user: User;
	session: Session;
}>;

type SessionData = {
	user: User;
	session: Session;
} & Record<string, any>;

type SessionResponse = (
	| { session: null; user: null; needsRefresh?: boolean }
	| { session: Session; user: User; needsRefresh?: boolean }
) &
	Record<string, any>;

type SessionRequest = {
	cancel: () => void;
	promise: Promise<void>;
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

	let activeRequest: SessionRequest | undefined;

	const refetch = (
		queryParams?: { query?: SessionQueryParams } | undefined,
	): Promise<void> => fetchSession(queryParams);

	const session: SessionAtom = atom<AuthQueryState<SessionData>>({
		data: null,
		error: null,
		isPending: true,
		isRefetching: false,
		refetch,
	});
	withEquality(session, isSessionAtomEqual);

	const executeSessionFetch = async (
		signal: AbortSignal,
		queryParams?: { query?: SessionQueryParams } | undefined,
	): Promise<void> => {
		const current = session.value;
		session.set({
			...current,
			isPending: current.data === null,
			isRefetching: true,
			error: null,
			refetch,
		});
		if (signal.aborted) return;

		try {
			const res = await $fetch<SessionResponse>("/get-session", {
				method: "GET",
				query: queryParams?.query,
				signal,
			});
			if (signal.aborted) {
				return;
			}

			let { data, error } = normalizeSessionResponse(res);

			if (data?.needsRefresh) {
				try {
					const refreshRes = await $fetch<SessionResponse>("/get-session", {
						method: "POST",
						signal,
					});
					if (signal.aborted) {
						return;
					}
					({ data, error } = normalizeSessionResponse(refreshRes));
				} catch {
					if (signal.aborted) {
						return;
					}
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
				return;
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
		} catch (fetchError) {
			if (signal.aborted) {
				return;
			}
			const latest = session.value;
			session.set({
				data: latest.data,
				error: fetchError as BetterFetchError,
				isPending: false,
				isRefetching: false,
				refetch,
			});
		}
	};

	const fetchSession = (
		queryParams?: { query?: SessionQueryParams } | undefined,
	): Promise<void> => {
		activeRequest?.cancel();
		const controller = new AbortController();
		const promise = Promise.resolve().then(() => {
			if (controller.signal.aborted) return;
			return executeSessionFetch(controller.signal, queryParams);
		});
		const request: SessionRequest = {
			cancel: () => controller.abort(),
			promise,
		};
		activeRequest = request;
		const clearActiveRequest = () => {
			if (activeRequest === request) activeRequest = undefined;
		};
		void request.promise.then(clearActiveRequest, clearActiveRequest);
		return request.promise;
	};

	const fetchSessionOnMount = (): Promise<void> =>
		activeRequest?.promise ?? fetchSession();

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
