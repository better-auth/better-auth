import { InferServerPlugin } from "../../client/plugins";
import type { BetterAuthOptions } from "../../types";

export const customSessionClient = <
	A extends {
		options: BetterAuthOptions;
	},
>() => {
	return InferServerPlugin<A, "custom-session">();
};
