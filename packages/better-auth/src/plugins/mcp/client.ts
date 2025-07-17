import type { mcp } from ".";
import type { BetterAuthClientPlugin } from "../../types";

export const mcpClient = () => {
	return {
		id: "mpc-client",
		$InferServerPlugin: {} as ReturnType<typeof mcp>,
	} satisfies BetterAuthClientPlugin;
};
