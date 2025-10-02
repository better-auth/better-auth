import { InferServerPlugin } from "../../client/plugins";
import type { BetterAuthOptions } from "../../types";
import type { Auth } from "better-auth";

export const customSessionClient = <
	A extends
		| Auth
		| {
				options: BetterAuthOptions;
		  },
>() => {
	return InferServerPlugin<A, "custom-session">();
};
