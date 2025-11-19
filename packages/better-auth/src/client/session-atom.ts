import type { BetterAuthClientOptions } from "@better-auth/core";
import type { BetterFetch } from "@better-fetch/fetch";
import { atom, onMount } from "nanostores";
import type { Session, User } from "../types";
import { useAuthQuery } from "./query";
import { createSessionRefreshManager } from "./session-refresh";

export function getSessionAtom(
	$fetch: BetterFetch,
	options?: BetterAuthClientOptions | undefined,
) {
	const $signal = atom<boolean>(false);
	const session = useAuthQuery<{
		user: User;
		session: Session;
	}>($signal, "/get-session", $fetch, {
		method: "GET",
	});

	onMount(session, () => {
		const refreshManager = createSessionRefreshManager({
			sessionAtom: session,
			sessionSignal: $signal,
			$fetch,
			options,
		});

		refreshManager.init();

		return () => {
			refreshManager.cleanup();
		};
	});

	return {
		session,
		$sessionSignal: $signal,
	};
}
