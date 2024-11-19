import type { BetterFetch } from "@better-fetch/fetch";
import { atom } from "nanostores";
import { useAuthQuery } from "./query";
import type { Session, User } from "../types";

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
