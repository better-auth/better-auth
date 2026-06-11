import { InferServerPlugin } from "../../client/plugins";
import type { Auth, BetterAuthOptions } from "../../types";

export const customSessionClient = <
	A extends
		| Auth
		| BetterAuthOptions
		| {
				options: BetterAuthOptions;
		  },
>() => {
	return InferServerPlugin<A, "custom-session">();
};
