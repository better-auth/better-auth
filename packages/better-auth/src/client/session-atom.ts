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
		onSuccess: (ctx) => {
			// todo: we should implement the full revalidation logic for async resources, like SWR or React Query
			// revalidate the session signal after expiration
			if (ctx.data.session && "expiresAt" in ctx.data.session) {
				const expiresAt = new Date(ctx.data.session.expiresAt);
				setTimeout(() => {
					$signal.set(false);
				}, expiresAt.getTime() - Date.now());
			}
		},
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
