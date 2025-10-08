import type { FieldAttribute, FieldAttributeFor } from "../../db";
import type {
	AuthPluginTableSchema,
	BetterAuthClientPlugin,
	BetterAuthOptions,
} from "../../types";
import type { BetterAuthPlugin } from "../../types";

export const inferAdditionalFields = <
	T extends BetterAuthOptions<S>,
	A extends {
		user?: {
			[key: string]: FieldAttributeFor<any>;
		};
		session?: {
			[key: string]: FieldAttributeFor<any>;
		};
	} = {},
	S extends {
		user?: AuthPluginTableSchema;
		session?: AuthPluginTableSchema;
	} = {
		user: A["user"] extends undefined
			? undefined
			: {
					fields: A["user"];
				} & AuthPluginTableSchema;
		session: A["session"] extends undefined
			? undefined
			: {
					fields: A["session"];
				} & AuthPluginTableSchema;
	},
>(
	schema?: A,
) => {
	type Opts = T extends BetterAuthOptions<S>
		? T
		: T extends {
					options: BetterAuthOptions<S>;
				}
			? T["options"]
			: never;

	type Plugin = Opts extends never
		? {
				id: "additional-fields-client";
				schema: S;
			}
		: Opts extends BetterAuthOptions<S>
			? {
					id: "additional-fields";
					schema: {
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
					};
				}
			: never;

	return {
		id: "additional-fields-client",
		$InferServerPlugin: {} as Plugin extends BetterAuthPlugin
			? Plugin
			: undefined,
	} satisfies BetterAuthClientPlugin;
};
