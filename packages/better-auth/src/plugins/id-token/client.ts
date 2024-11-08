import type { idTokenAuth } from ".";
import type { BetterAuthClientPlugin } from "../../types";

export const idTokenAuthClient = () => {
	return {
		id: "id-token-auth",
		$InferServerPlugin: {} as ReturnType<typeof idTokenAuth>,
	} satisfies BetterAuthClientPlugin;
};
