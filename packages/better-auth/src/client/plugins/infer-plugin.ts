import type {
	BetterAuthClientPlugin,
	BetterAuthOptions,
} from "@better-auth/core";

export const InferServerPlugin = <
	AuthOrOption extends
		| BetterAuthOptions
		| {
				options: BetterAuthOptions;
		  },
	ID extends string,
>() => {
	type Option = AuthOrOption extends { options: infer O } ? O : AuthOrOption;
	type Plugin =
		Option["plugins"] extends Array<infer P>
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
