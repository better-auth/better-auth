import { BetterAuthClientPlugin } from "better-auth";
import { customSession } from "./custom-session";

export const customSessionClient = () => {
	return {
		id: "session-client",
		$InferServerPlugin: {} as ReturnType<typeof customSession>,
	} satisfies BetterAuthClientPlugin;
};
