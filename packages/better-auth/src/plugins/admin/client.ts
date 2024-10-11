import type { admin } from ".";
import type { BetterAuthClientPlugin } from "../../types";

export const adminClient = () => {
	return {
		id: "better-auth-client",
		$InferServerPlugin: {} as ReturnType<typeof admin>,
	} satisfies BetterAuthClientPlugin;
};
