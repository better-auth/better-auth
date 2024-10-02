import type { BetterAuthOptions } from ".";
import type { Session, User } from "../db/schema";
import type { Auth } from "../auth";
import type { FieldAttribute, InferFieldOutput } from "../db";
import type { StripEmptyObjects, UnionToIntersection } from "./helper";
import type { BetterAuthPlugin } from "./plugins";

type InferAdditional<
	Options extends BetterAuthOptions,
	Key extends string,
> = Options["plugins"] extends Array<infer T>
	? T extends {
			schema: {
				[key in Key]: {
					fields: infer Field;
				};
			};
		}
		? Field extends Record<infer Key, FieldAttribute>
			? {
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
			: {}
		: {}
	: {};

type AdditionalSessionFields<Options extends BetterAuthOptions> =
	InferAdditional<Options, "session">;

type AdditionalUserFields<Options extends BetterAuthOptions> = InferAdditional<
	Options,
	"user"
>;

export type InferUser<O extends BetterAuthOptions | Auth> = UnionToIntersection<
	StripEmptyObjects<
		User &
			(O extends BetterAuthOptions
				? AdditionalUserFields<O>
				: O extends Auth
					? AdditionalUserFields<O["options"]>
					: {})
	>
>;

export type InferSession<O extends BetterAuthOptions | Auth> =
	StripEmptyObjects<
		Session &
			(O extends BetterAuthOptions
				? AdditionalSessionFields<O>
				: O extends Auth
					? AdditionalSessionFields<O["options"]>
					: {})
	>;

export type InferPluginTypes<O extends BetterAuthOptions> =
	O["plugins"] extends Array<infer P>
		? UnionToIntersection<
				P extends BetterAuthPlugin
					? P["$Infer"] extends Record<string, any>
						? P["$Infer"]
						: {}
					: {}
			>
		: {};

interface RateLimit {
	/**
	 * The key to use for rate limiting
	 */
	key: string;
	/**
	 * The number of requests made
	 */
	count: number;
	/**
	 * The last request time in milliseconds
	 */
	lastRequest: number;
}

export type { User, Session, RateLimit };
