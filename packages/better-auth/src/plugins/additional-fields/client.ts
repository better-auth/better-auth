import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { DBFieldAttribute } from "@better-auth/core/db";
import type { z } from "zod";
import type { ZodSchemaToDBFields } from "../../db/from-zod-types";
import type { BetterAuthOptions, BetterAuthPlugin } from "../../types";

type DBSchemaShape = {
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

type ZodSchemaShape = {
	user?: z.ZodObject<any>;
	session?: z.ZodObject<any>;
};

export const inferAdditionalFields = <
	T,
	S extends DBSchemaShape | ZodSchemaShape = {},
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
				user?: any;
				session?: any;
			}
			? {
					id: "additional-fields-client";
					schema: {
						user: {
							fields: S["user"] extends z.ZodObject<any>
								? ZodSchemaToDBFields<S["user"]>
								: S["user"] extends { [key: string]: DBFieldAttribute }
									? S["user"]
									: {};
						};
						session: {
							fields: S["session"] extends z.ZodObject<any>
								? ZodSchemaToDBFields<S["session"]>
								: S["session"] extends { [key: string]: DBFieldAttribute }
									? S["session"]
									: {};
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
