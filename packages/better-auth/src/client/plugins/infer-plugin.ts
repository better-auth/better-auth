import type { AuthPluginSchema, BetterAuthClientPlugin, BetterAuthOptions } from "../../types";

export const InferServerPlugin = <
	AuthOrOption extends
		| BetterAuthOptions<S>
		| {
				options: BetterAuthOptions<S>;
		  },
	ID extends string,
	S extends AuthPluginSchema,
>() => {
	type Option = AuthOrOption extends { options: infer O } ? O : AuthOrOption;
	type Plugin = Option["plugins"] extends Array<infer P>
		? P extends {
				id: ID;
			}
			? P
			: never
		: never;
	return {
		id: "infer-server-plugin",
		$InferServerPlugin: {} as Plugin,
	} satisfies BetterAuthClientPlugin;
};
