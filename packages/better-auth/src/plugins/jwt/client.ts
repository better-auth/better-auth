import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { jwt } from "./index";

export const jwtClient = () => {
	return {
		id: "better-auth-client",
		$InferServerPlugin: {} as ReturnType<typeof jwt>,
	} satisfies BetterAuthClientPlugin;
};

export type * from "./types";
