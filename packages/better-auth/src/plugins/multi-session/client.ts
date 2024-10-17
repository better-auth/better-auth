import type { multiSession } from ".";
import type { BetterAuthClientPlugin } from "../../types";

export const multiSessionClient = () => {
	return {
		id: "multi-session",
		$InferServerPlugin: {} as ReturnType<typeof multiSession>,
	} satisfies BetterAuthClientPlugin;
};
