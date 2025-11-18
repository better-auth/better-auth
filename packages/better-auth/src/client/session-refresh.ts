import type { BetterAuthClientOptions } from "@better-auth/core";
import type { BetterFetch } from "@better-fetch/fetch";
import type { WritableAtom } from "nanostores";
import { getGlobalBroadcastChannel } from "./broadcast-channel";
import { getGlobalFocusManager } from "./focus-manager";
import { getGlobalOnlineManager } from "./online-manager";

const now = () => Math.floor(Date.now() / 1000);

export interface SessionRefreshOptions {
	sessionAtom: WritableAtom<any>;
	sessionSignal: WritableAtom<boolean>;
	$fetch: BetterFetch;
	options?: BetterAuthClientOptions | undefined;
}

interface SessionRefreshState {
	lastSync: number;
	cachedSession: any;
	pollInterval?: ReturnType<typeof setInterval> | undefined;
	unsubscribeBroadcast?: (() => void) | undefined;
	unsubscribeFocus?: (() => void) | undefined;
	unsubscribeOnline?: (() => void) | undefined;
}

export function createSessionRefreshManager(opts: SessionRefreshOptions) {
	const { sessionAtom, sessionSignal, $fetch, options = {} } = opts;

	const refetchInterval = options.sessionOptions?.refetchInterval ?? 0;
	const refetchOnWindowFocus =
		options.sessionOptions?.refetchOnWindowFocus ?? true;
	const refetchWhenOffline =
		options.sessionOptions?.refetchWhenOffline ?? false;

	const state: SessionRefreshState = {
		lastSync: 0,
		cachedSession: undefined,
	};

	const shouldRefetch = (): boolean => {
		return refetchWhenOffline || getGlobalOnlineManager().isOnline;
	};

	const triggerRefetch = (
		event?:
			| {
					event?: "poll" | "visibilitychange" | "storage";
			  }
			| undefined,
	) => {
		if (!shouldRefetch()) return;

		if (event?.event === "storage") {
			state.lastSync = now();
			sessionSignal.set(!sessionSignal.get());
			return;
		}

		const currentSession = sessionAtom.get();

		if (event?.event === "poll") {
			$fetch("/get-session")
				.then((res) => {
					sessionAtom.set({
						...currentSession,
						data: res.data,
						error: res.error || null,
					});
					state.lastSync = now();
					sessionSignal.set(!sessionSignal.get());
				})
				.catch(() => {});
			return;
		}

		if (
			currentSession?.data === null ||
			currentSession?.data === undefined ||
			event?.event === "visibilitychange"
		) {
			state.lastSync = now();
			sessionSignal.set(!sessionSignal.get());
		}
	};

	const broadcastSessionUpdate = (
		trigger: "signout" | "getSession" | "updateUser",
	) => {
		getGlobalBroadcastChannel().post({
			event: "session",
			data: { trigger },
			clientId: Math.random().toString(36).substring(7),
		});
	};

	const setupPolling = () => {
		if (refetchInterval && refetchInterval > 0) {
			state.pollInterval = setInterval(() => {
				const currentSession = sessionAtom.get();
				if (currentSession?.data) {
					triggerRefetch({ event: "poll" });
				}
			}, refetchInterval * 1000);
		}
	};

	const setupBroadcast = () => {
		state.unsubscribeBroadcast = getGlobalBroadcastChannel().subscribe(() => {
			triggerRefetch({ event: "storage" });
		});
	};

	const setupFocusRefetch = () => {
		if (!refetchOnWindowFocus) return;

		state.unsubscribeFocus = getGlobalFocusManager().subscribe(() => {
			triggerRefetch({ event: "visibilitychange" });
		});
	};

	const setupOnlineRefetch = () => {
		state.unsubscribeOnline = getGlobalOnlineManager().subscribe((online) => {
			if (online) {
				triggerRefetch({ event: "visibilitychange" });
			}
		});
	};

	const init = () => {
		setupPolling();
		setupBroadcast();
		setupFocusRefetch();
		setupOnlineRefetch();

		getGlobalBroadcastChannel().setup();
		getGlobalFocusManager().setup();
		getGlobalOnlineManager().setup();
	};

	const cleanup = () => {
		if (state.pollInterval) {
			clearInterval(state.pollInterval);
			state.pollInterval = undefined;
		}
		if (state.unsubscribeBroadcast) {
			state.unsubscribeBroadcast();
			state.unsubscribeBroadcast = undefined;
		}
		if (state.unsubscribeFocus) {
			state.unsubscribeFocus();
			state.unsubscribeFocus = undefined;
		}
		if (state.unsubscribeOnline) {
			state.unsubscribeOnline();
			state.unsubscribeOnline = undefined;
		}
		state.lastSync = 0;
		state.cachedSession = undefined;
	};

	return {
		init,
		cleanup,
		triggerRefetch,
		broadcastSessionUpdate,
	};
}
