import type { accessControl } from ".";
import type { BetterAuthClientPlugin } from "../../types";

export const accessControlClient = () => {
	return {
		id: "access-control",
		$InferServerPlugin: {} as ReturnType<typeof accessControl>,
	} satisfies BetterAuthClientPlugin;
};
