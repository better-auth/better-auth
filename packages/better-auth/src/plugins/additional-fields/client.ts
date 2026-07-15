import type {
	BetterAuthClientPlugin,
	BetterAuthOptions,
	BetterAuthPlugin,
} from "@better-auth/core";
import type { DBFieldAttribute } from "@better-auth/core/db";
import { PACKAGE_VERSION } from "../../version";

type AdditionalFieldsSchema = Partial<
	Record<
		"user" | "session" | "account" | "identity",
		Record<string, DBFieldAttribute>
	>
>;

export const inferAdditionalFields = <T, S extends AdditionalFieldsSchema = {}>(
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
		? S extends AdditionalFieldsSchema
			? {
					id: "additional-fields-client";
					version: string;
					schema: {
						user: {
							fields: S["user"] extends object ? S["user"] : {};
						};
						session: {
							fields: S["session"] extends object ? S["session"] : {};
						};
						account: {
							fields: S["account"] extends object ? S["account"] : {};
						};
						identity: {
							fields: S["identity"] extends object ? S["identity"] : {};
						};
					};
				}
			: never
		: Opts extends BetterAuthOptions
			? {
					id: "additional-fields";
					version: string;
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
						account: {
							fields: Opts["account"] extends {
								additionalFields: infer U;
							}
								? U
								: {};
						};
						identity: {
							fields: Opts["identity"] extends {
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
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as Plugin extends BetterAuthPlugin
			? Plugin
			: undefined,
	} satisfies BetterAuthClientPlugin;
};
