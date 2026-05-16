import type { BetterAuthClientOptions } from "@better-auth/core";
import type { BetterFetch } from "@better-fetch/fetch";
import { atom, onMount } from "nanostores";
import type { Session, User } from "../types";
import type { AuthQueryAtom } from "./query";
import { useAuthQuery } from "./query";
import { createSessionRefreshManager } from "./session-refresh";

export type SessionAtom = AuthQueryAtom<{
	user: User;
	session: Session;
}>;

export function getSessionAtom(
	$fetch: BetterFetch,
	options?: BetterAuthClientOptions | undefined,
) {
	const $signal = atom<boolean>(false);
	// Marker atom incremented after direct session fetch to signal the query layer
	// that the next signal toggle is self-originated and should skip one refetch.
	const $sessionRefreshMarker = atom(0);
	const session: SessionAtom = useAuthQuery<{
		user: User;
		session: Session;
	}>(
		[$signal, $sessionRefreshMarker],
		"/get-session",
		$fetch,
		{
			method: "GET",
		},
		{
			refreshMarkerAtom: $sessionRefreshMarker,
		},
	);

	let broadcastSessionUpdate: (
		trigger: "signout" | "getSession" | "updateUser",
	) => void = () => {};

	onMount(session, () => {
		const refreshManager = createSessionRefreshManager({
			sessionAtom: session,
			sessionSignal: $signal,
			sessionRefreshMarker: $sessionRefreshMarker,
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
