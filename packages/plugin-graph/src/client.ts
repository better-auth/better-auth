import type { BetterAuthClientPlugin } from "better-auth/client";

export function graphClient(): BetterAuthClientPlugin {
	return {
		id: "graph",
		$InferServerPlugin: {} as any,
	};
}

export default graphClient;
