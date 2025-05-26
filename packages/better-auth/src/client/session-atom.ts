import type { BetterFetch } from "@better-fetch/fetch";
import { atom } from "nanostores";
import { useAuthQuery } from "./query";
import type { Session, User } from "../types";

export function getSessionAtom<T = { user: User; session: Session }>(
	$fetch: BetterFetch,
	initialSession?: T | null,
) {
	const $signal = atom<boolean>(false);
	const session = useAuthQuery<T>(
		$signal,
		"/get-session",
		$fetch,
		{
			method: "GET",
		},
		initialSession || undefined,
	);
	return {
		session,
		$sessionSignal: $signal,
	};
}
