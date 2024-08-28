import { atom, computed, task } from "nanostores";
import { Prettify } from "../types/helper";
import { BetterAuth } from "../auth";
import { BetterFetch } from "@better-fetch/fetch";
import { InferSession, InferUser } from "../types/models";

export function getSessionAtom<Auth extends BetterAuth>(client: BetterFetch) {
	type UserWithAdditionalFields = InferUser<Auth["options"]>;
	type SessionWithAdditionalFields = InferSession<Auth["options"]>;
	const $signal = atom<boolean>(false);
	const $session = computed($signal, () =>
		task(async () => {
			const session = await client("/session", {
				credentials: "include",
				method: "GET",
			});
			return session.data as {
				user: Prettify<UserWithAdditionalFields>;
				session: Prettify<SessionWithAdditionalFields>;
			} | null;
		}),
	);
	return { $session, $sessionSignal: $signal };
}
