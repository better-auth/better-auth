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
				? {
						[key in keyof Field]: InferFieldOutput<Field[key]>;
					}
				: {}
			: {}
		: {};
	type AdditionalUserFields = Auth["options"]["plugins"] extends Array<infer T>
		? T extends {
				schema: {
					user: {
						fields: infer Field;
					};
				};
			}
			? Field extends Record<infer Key, FieldAttribute>
				? Prettify<
						{
							[key in Key as Field[key]["required"] extends false
								? never
								: Field[key]["defaultValue"] extends
											| boolean
											| string
											| number
											| Date
											| Function
									? key
									: never]: InferFieldOutput<Field[key]>;
						} & {
							[key in Key as Field[key]["returned"] extends false
								? never
								: key]?: InferFieldOutput<Field[key]>;
						}
					>
				: {}
			: {}
		: {};

	type UserWithAdditionalFields = User & AdditionalUserFields;
	type SessionWithAdditionalFields = Session & AdditionalSessionFields;

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
	return { $session };
}
