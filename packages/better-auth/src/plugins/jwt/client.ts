import type { jwt } from "./index";
import type { BetterAuthClientPlugin } from "@better-auth/core";

export const jwtClient = () => {
	return {
		id: "better-auth-client",
		$InferServerPlugin: {} as ReturnType<typeof jwt>,
	} satisfies BetterAuthClientPlugin;
};
