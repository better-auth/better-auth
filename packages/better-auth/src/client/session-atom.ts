import { atom, computed, task } from "nanostores";
import { Session, User } from "../adapters/schema";
import { Prettify } from "../types/helper";
import { BetterAuth } from "../auth";
import { FieldAttribute, InferFieldOutput } from "../db";
import { BetterFetch } from "@better-fetch/fetch";

export function getSessionAtom<Auth extends BetterAuth>(client: BetterFetch) {
	type AdditionalSessionFields = Auth["options"]["plugins"] extends Array<
		infer T
	>
		? T extends {
				schema: {
					session: {
						fields: infer Field;
					};
				};
			}
			? Field extends Record<string, FieldAttribute>
				? InferFieldOutput<Field>
				: {}
			: {}
		: {};
	const $signal = atom<boolean>(false);
	const $session = computed($signal, () =>
		task(async () => {
			const session = await client("/session", {
				credentials: "include",
				method: "GET",
			});
			return session.data as {
				user: User;
				session: Prettify<Session & AdditionalSessionFields>;
			} | null;
		}),
	);
	return { $session };
}
