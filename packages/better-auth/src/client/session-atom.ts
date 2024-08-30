import type { BetterFetch } from "@better-fetch/fetch";
import { atom, computed, task } from "nanostores";
import type { BetterAuth } from "../auth";
import type { Prettify } from "../types/helper";
import type { InferSession, InferUser } from "../types/models";

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
