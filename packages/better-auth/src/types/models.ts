import type { BetterAuthOptions } from ".";
import type { Session, User } from "../adapters/schema";
import type { BetterAuth } from "../auth";
import type { FieldAttribute, InferFieldOutput } from "../db";
import type { Prettify, UnionToIntersection } from "./helper";

type AdditionalSessionFields<Options extends BetterAuthOptions> =
	Options["plugins"] extends Array<infer T>
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
type AdditionalUserFields<Options extends BetterAuthOptions> =
	Options["plugins"] extends Array<infer T>
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

export type InferUser<O extends BetterAuthOptions | BetterAuth> =
	UnionToIntersection<
		User &
			(O extends BetterAuthOptions
				? AdditionalUserFields<O>
				: O extends BetterAuth
					? AdditionalUserFields<O["options"]>
					: {})
	>;

export type InferSession<O extends BetterAuthOptions | BetterAuth> =
	UnionToIntersection<
		Session &
			(O extends BetterAuthOptions
				? AdditionalSessionFields<O>
				: O extends BetterAuth
					? AdditionalSessionFields<O["options"]>
					: {})
	>;
