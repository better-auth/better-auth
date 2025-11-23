import type {
	BetterAuthClientPlugin,
	BetterAuthOptions,
	BetterAuthPlugin,
} from "@better-auth/core";
import type { DBFieldAttribute } from "@better-auth/core/db";

export const inferAdditionalFields = <
	T,
	S extends {
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
	} = {},
>(
	schema?: S | undefined,
) => {
	type Opts = T extends BetterAuthOptions
		? T
		: T extends {
					options: BetterAuthOptions;
				}
			? T["options"]
			: never;

	type Plugin = Opts extends never
		? S extends {
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
			}
			? {
					id: "additional-fields-client";
					schema: {
						user: {
							fields: S["user"] extends object ? S["user"] : {};
						};
						session: {
							fields: S["session"] extends object ? S["session"] : {};
						};
					};
				}
			: never
		: Opts extends BetterAuthOptions
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
