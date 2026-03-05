import type { BetterAuthClientPlugin } from "better-auth/client";

export function agentsClient(): BetterAuthClientPlugin {
	return {
		id: "agents",
		$InferServerPlugin: {} as any,
	};
}

export default agentsClient;
