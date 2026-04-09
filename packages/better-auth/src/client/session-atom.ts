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

	let abortController: AbortController | undefined;

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

	const fetchSession = async (
		queryParams?: { query?: SessionQueryParams } | undefined,
	): Promise<void> => {
		abortController?.abort();
		const controller = new AbortController();
		abortController = controller;

		const current = session.get();
		session.set({
			...current,
			isPending: current.data === null,
			isRefetching: true,
			error: null,
			refetch,
		});

		try {
			const res = await $fetch<SessionResponse>("/get-session", {
				method: "GET",
				query: queryParams?.query,
				signal: controller.signal,
			});
			if (controller.signal.aborted) return;

			let { data, error } = normalizeSessionResponse(res);

			if (data?.needsRefresh) {
				try {
					const refreshRes = await $fetch<SessionResponse>("/get-session", {
						method: "POST",
						signal: controller.signal,
					});
					if (controller.signal.aborted) return;
					({ data, error } = normalizeSessionResponse(refreshRes));
				} catch {
					if (controller.signal.aborted) return;
				}
			}

			if (error) {
				const latest = session.get();
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

			const sessionData = (data ?? null) as SessionData | null;
			const current = session.get();
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
			if (controller.signal.aborted) return;
			const latest = session.get();
			session.set({
				data: latest.data,
				error: fetchError as BetterFetchError,
				isPending: false,
				isRefetching: false,
				refetch,
			});
		}
	};

	let broadcastSessionUpdate: (
		trigger: "signout" | "getSession" | "updateUser",
	) => void = () => {};

	onMount(session, () => {
		let timeoutId: ReturnType<typeof setTimeout> | undefined;

		if (!isServer()) {
			timeoutId = setTimeout(() => {
				void fetchSession();
			}, 0);
		}

		const refreshManager = createSessionRefreshManager({
			fetchSession,
			sessionSignal: $signal,
			options,
		});
		refreshManager.init();
		broadcastSessionUpdate = refreshManager.broadcastSessionUpdate;

		return () => {
			if (timeoutId) clearTimeout(timeoutId);
			abortController?.abort();
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
