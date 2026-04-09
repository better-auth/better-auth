import type { BetterAuthClientOptions } from "@better-auth/core";
import type { WritableAtom } from "nanostores";
import { getGlobalBroadcastChannel } from "./broadcast-channel";
import { getGlobalFocusManager } from "./focus-manager";
import { getGlobalOnlineManager } from "./online-manager";

const now = () => Math.floor(Date.now() / 1000);

/**
 * Rate limit: don't refetch on focus if a session request was made within this many seconds
 */
const FOCUS_REFETCH_RATE_LIMIT_SECONDS = 5;

export interface SessionRefreshOptions {
	fetchSession: () => Promise<void>;
	sessionSignal: WritableAtom<boolean>;
	options?: BetterAuthClientOptions | undefined;
}

interface SessionRefreshState {
	lastSessionRequest: number;
	pollInterval?: ReturnType<typeof setInterval> | undefined;
	unsubscribeBroadcast?: (() => void) | undefined;
	unsubscribeFocus?: (() => void) | undefined;
	unsubscribeOnline?: (() => void) | undefined;
	unsubscribeSignal?: (() => void) | undefined;
}

export function createSessionRefreshManager(opts: SessionRefreshOptions) {
	const { fetchSession, sessionSignal, options = {} } = opts;

	const refetchInterval = options.sessionOptions?.refetchInterval ?? 0;
	const refetchOnWindowFocus =
		options.sessionOptions?.refetchOnWindowFocus ?? true;
	const refetchWhenOffline =
		options.sessionOptions?.refetchWhenOffline ?? false;

	const state: SessionRefreshState = {
		lastSessionRequest: 0,
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
			void fetchSession();
			return;
		}

		if (event?.event === "poll") {
			state.lastSessionRequest = now();
			void fetchSession();
			return;
		}

		if (event?.event === "visibilitychange") {
			const timeSinceLastRequest = now() - state.lastSessionRequest;
			if (timeSinceLastRequest < FOCUS_REFETCH_RATE_LIMIT_SECONDS) {
				return;
			}
			state.lastSessionRequest = now();
			void fetchSession();
			return;
		}

		void fetchSession();
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
				triggerRefetch({ event: "poll" });
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

	const setupSignalSubscription = () => {
		state.unsubscribeSignal = sessionSignal.listen(() => {
			triggerRefetch();
		});
	};

	const init = () => {
		setupPolling();
		setupBroadcast();
		setupFocusRefetch();
		setupOnlineRefetch();
		setupSignalSubscription();

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
		if (state.unsubscribeSignal) {
			state.unsubscribeSignal();
			state.unsubscribeSignal = undefined;
		}
		state.lastSessionRequest = 0;
	};

	return {
		init,
		cleanup,
		triggerRefetch,
		broadcastSessionUpdate,
	};
}
