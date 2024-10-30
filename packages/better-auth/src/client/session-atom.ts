import type { BetterFetch } from "@better-fetch/fetch";
import { atom } from "nanostores";
import type { Prettify } from "../types/helper";
import type {
	ClientOptions,
	InferSessionFromClient,
	InferUserFromClient,
} from "./types";
import { useAuthQuery } from "./query";

export function getSessionAtom<Option extends ClientOptions>(
	$fetch: BetterFetch,
) {
	type UserWithAdditionalFields = InferUserFromClient<Option>;
	type SessionWithAdditionalFields = InferSessionFromClient<Option>;
	const $signal = atom<boolean>(false);
	const session = useAuthQuery<{
		user: Prettify<UserWithAdditionalFields>;
		session: Prettify<SessionWithAdditionalFields>;
	}>($signal, "/get-session", $fetch, {
		method: "GET",
	});
	return {
		session,
		$sessionSignal: $signal,
	};
}
