import type { multiSession } from ".";
import type { BetterAuthClientPlugin } from "../../types";

export const multiSessionClient = () => {
	return {
		id: "multi-session",
		$InferServerPlugin: {} as ReturnType<typeof multiSession>,
		atomListeners: [
			{
				matcher(path) {
					return path === "/multi-session/set-active";
				},
				signal: "$sessionSignal",
			},
		],
	} satisfies BetterAuthClientPlugin;
};
