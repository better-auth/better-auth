import type { BetterAuthClientOptions } from "@better-auth/core";
import type { BetterFetch } from "@better-fetch/fetch";
import { atom, onMount } from "nanostores";
import type { Session, User } from "../types/index.js";
import type { AuthQueryAtom } from "./query.js";
import { useAuthQuery } from "./query.js";
import { createSessionRefreshManager } from "./session-refresh.js";

export type SessionAtom = AuthQueryAtom<{
	user: User;
	session: Session;
}>;

export function getSessionAtom(
	$fetch: BetterFetch,
	options?: BetterAuthClientOptions | undefined,
) {
	const $signal = atom<boolean>(false);
	const session: SessionAtom = useAuthQuery<{
		user: User;
		session: Session;
	}>($signal, "/get-session", $fetch, {
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
