import type { BetterAuthOptions } from "@better-auth/core";
import type { DBFieldAttribute } from "@better-auth/core/db";

type StrictDBFieldAttribute<Field> = Field extends DBFieldAttribute
	? Exclude<keyof Field, keyof DBFieldAttribute> extends never
		? Field
		: never
	: Field;

type StrictAdditionalFields<Fields> =
	Fields extends Record<string, DBFieldAttribute>
		? {
				[K in keyof Fields]: StrictDBFieldAttribute<Fields[K]>;
			}
		: Fields;

type StrictModelAdditionalFields<Model> = Model extends {
	additionalFields?: infer Fields;
}
	? Omit<Model, "additionalFields"> & {
			additionalFields?: StrictAdditionalFields<NonNullable<Fields>>;
		}
	: Model;

export type StrictAdditionalFieldsOptions<Options extends BetterAuthOptions> =
	Omit<Options, "user" | "session" | "account" | "verification"> & {
		user?: StrictModelAdditionalFields<Options["user"]>;
		session?: StrictModelAdditionalFields<Options["session"]>;
		account?: StrictModelAdditionalFields<Options["account"]>;
		verification?: StrictModelAdditionalFields<Options["verification"]>;
	};
