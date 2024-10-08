import type { BetterAuthClientPlugin, BetterAuthOptions } from "../../types";
import type { BetterAuthPlugin } from "../../types";

export const inferAdditionalFields = <T>(schema?: T) => {
	type Opts = T extends BetterAuthOptions
		? T
		: T extends {
					options: BetterAuthOptions;
				}
			? T["options"]
			: never;
	type Plugin = Opts extends BetterAuthOptions
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
		: T extends {
					user: {
						fields: object;
					};
					session: {
						fields: object;
					};
				}
			? {
					id: "additional-fields-client";
					schema: {
						user: {
							fields: T["user"] extends object ? T["user"] : {};
						};
						session: {
							fields: T["session"] extends object ? T["session"] : {};
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
