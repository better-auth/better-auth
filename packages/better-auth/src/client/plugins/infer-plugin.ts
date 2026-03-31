import type {
	BetterAuthClientPlugin,
	BetterAuthOptions,
} from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version";

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
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as Plugin,
	} satisfies BetterAuthClientPlugin;
};
