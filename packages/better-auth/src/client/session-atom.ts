import type { BetterAuthClientOptions } from "@better-auth/core";
import type { BetterFetch } from "@better-fetch/fetch";
import { atom, onMount } from "nanostores";
import type { Session, User } from "../types";
import type { AuthQueryAtom } from "./query";
import { useAuthQuery } from "./query";
import { createSessionRefreshManager } from "./session-refresh";

export type SessionData = {
	user: User;
	session: Session;
};

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

export function getSessionAtom(
	$fetch: BetterFetch,
	options?: BetterAuthClientOptions | undefined,
) {
	const $signal = atom<boolean>(false);
	const session = useAuthQuery<SessionData>($signal, "/get-session", $fetch, {
		method: "GET",
	});

	let broadcastSessionUpdate: (
		trigger: "signout" | "getSession" | "updateUser",
	) => void = () => {};

	onMount(session, () => {
		const refreshManager = createSessionRefreshManager({
			sessionAtom: session,
			sessionSignal: $signal,
			$fetch,
			options,
		});

		refreshManager.init();
		broadcastSessionUpdate = refreshManager.broadcastSessionUpdate;

		return () => {
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
