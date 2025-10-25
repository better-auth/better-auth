import type { BetterFetch } from "@better-fetch/fetch";
import { atom } from "nanostores";
import type { Session, User } from "better-auth/types";
import { useAuthQuery } from "./query";

export function getSessionAtom($fetch: BetterFetch) {
	const $signal = atom<boolean>(false);
	const session = useAuthQuery<{
		user: User;
		session: Session;
	}>($signal, "/get-session", $fetch, {
		method: "GET",
	});
	return {
		session,
		$sessionSignal: $signal,
	};
}
