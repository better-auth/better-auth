import type { BetterAuthClientOptions } from "@better-auth/core";
import type { BetterFetch } from "@better-fetch/fetch";
import type { WritableAtom } from "nanostores";
import { createBroadcastChannel } from "./broadcast-channel";

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
	unsubscribeVisibility?: (() => void) | undefined;
	unsubscribeOnline?: (() => void) | undefined;
	unsubscribeOffline?: (() => void) | undefined;
}

export function createSessionRefreshManager(opts: SessionRefreshOptions) {
	const { sessionAtom, sessionSignal, options = {} } = opts;

	const {
		refetchInterval = 0,
		refetchOnWindowFocus = true,
		refetchWhenOffline = false,
	} = options?.sessionOptions || {};

	const state: SessionRefreshState = {
		lastSync: 0,
		cachedSession: undefined,
	};

	let isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

	const broadcast = createBroadcastChannel();

	const shouldRefetch = (): boolean => {
		if (typeof window === "undefined") return false;
		return refetchWhenOffline || isOnline;
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

		if (
			currentSession?.data === null ||
			currentSession?.data === undefined ||
			event?.event === "poll" ||
			event?.event === "visibilitychange"
		) {
			state.lastSync = now();
			sessionSignal.set(!sessionSignal.get());
		}
	};

	const broadcastSessionUpdate = (
		trigger: "signout" | "getSession" | "updateUser",
	) => {
		broadcast.post({
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
		state.unsubscribeBroadcast = broadcast.receive(() => {
			triggerRefetch({ event: "storage" });
		});
	};

	const setupVisibilityChange = () => {
		if (!refetchOnWindowFocus) return;
		if (typeof document === "undefined") return;

		const visibilityHandler = () => {
			if (document.visibilityState === "visible") {
				triggerRefetch({ event: "visibilitychange" });
			}
		};

		document.addEventListener("visibilitychange", visibilityHandler, false);
		state.unsubscribeVisibility = () => {
			document.removeEventListener(
				"visibilitychange",
				visibilityHandler,
				false,
			);
		};
	};

	const setupOnlineDetection = () => {
		if (typeof window === "undefined") return;

		const setOnline = () => {
			isOnline = true;
			triggerRefetch({ event: "visibilitychange" });
		};

		const setOffline = () => {
			isOnline = false;
		};

		window.addEventListener("online", setOnline);
		window.addEventListener("offline", setOffline);

		state.unsubscribeOnline = () =>
			window.removeEventListener("online", setOnline);
		state.unsubscribeOffline = () =>
			window.removeEventListener("offline", setOffline);
	};

	const init = () => {
		if (typeof window === "undefined") return;

		setupPolling();
		setupBroadcast();
		setupVisibilityChange();
		setupOnlineDetection();
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
		if (state.unsubscribeVisibility) {
			state.unsubscribeVisibility();
			state.unsubscribeVisibility = undefined;
		}
		if (state.unsubscribeOnline) {
			state.unsubscribeOnline();
			state.unsubscribeOnline = undefined;
		}
		if (state.unsubscribeOffline) {
			state.unsubscribeOffline();
			state.unsubscribeOffline = undefined;
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
