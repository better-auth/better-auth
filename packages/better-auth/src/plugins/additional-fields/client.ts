import type {
	BetterAuthClientPlugin,
	BetterAuthOptions,
	BetterAuthPlugin,
} from "@better-auth/core";
import type { DBFieldAttribute } from "@better-auth/core/db";

type SchemaInput = {
	user?:
		| {
				[key: string]: DBFieldAttribute;
		  }
		| undefined;
	session?:
		| {
				[key: string]: DBFieldAttribute;
		  }
		| undefined;
};

type InferOpts<T> = T extends BetterAuthOptions
	? T
	: T extends {
				options: BetterAuthOptions;
			}
		? T["options"]
		: never;

type InferSchema<T, S extends SchemaInput> = InferOpts<T> extends infer Opts
	? S extends SchemaInput
		? {
				user: {
					fields: S["user"] extends object ? S["user"] : {};
				};
				session: {
					fields: S["session"] extends object ? S["session"] : {};
				};
			}
		: Opts extends BetterAuthOptions
			? {
					user: {
						fields: Opts["user"] extends {
							additionalFields: infer U;
						}
							? U
							: {};
					};
					session: {
						fields: Opts["session"] extends {
							additionalFields: infer U;
						}
							? U
							: {};
					};
				}
			: never
	: never;

type InferServerPlugin<T, S extends SchemaInput> = InferOpts<T> extends never
	? S extends SchemaInput
		? {
				id: "additional-fields-client";
				schema: InferSchema<T, S>;
			}
		: never
	: InferOpts<T> extends BetterAuthOptions
		? {
				id: "additional-fields";
				schema: InferSchema<T, S>;
			}
		: never;

type InferPlugin<T, S extends SchemaInput> = {
	id: "additional-fields-client";
	$InferServerPlugin: InferServerPlugin<T, S> extends BetterAuthPlugin
		? InferServerPlugin<T, S>
		: undefined;
};

export function inferAdditionalFields<T, S extends SchemaInput = {}>(
	schema?: S | undefined,
): InferPlugin<T, S>;
export function inferAdditionalFields<T, S extends SchemaInput = {}>(
	flag: "asPlugin",
	schema?: S | undefined,
): InferPlugin<T, S>;
export function inferAdditionalFields<T, S extends SchemaInput = {}>(
	flag: "asSchema",
	schema?: S | undefined,
): InferSchema<T, S>;
export function inferAdditionalFields<T, S extends SchemaInput>(
	schema?: string | SchemaInput | undefined,
) {
	if (schema === "asSchema") {
		return {} as InferSchema<T, S>;
	}

	return {
		id: "additional-fields-client",
		$InferServerPlugin: {},
	} as InferPlugin<T, S> satisfies BetterAuthClientPlugin;
}
