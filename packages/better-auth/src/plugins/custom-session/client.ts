import type { Auth } from "better-auth";
import { InferServerPlugin } from "../../client/plugins/index.js";
import type { BetterAuthOptions } from "../../types/index.js";

export const customSessionClient = <
	A extends
		| Auth
		| {
				options: BetterAuthOptions;
		  },
>() => {
	return InferServerPlugin<A, "custom-session">();
};
