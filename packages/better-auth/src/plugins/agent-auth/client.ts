import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { agentAuth } from ".";
import { AGENT_AUTH_ERROR_CODES } from "./error-codes";

export * from "./error-codes";

export const agentAuthClient = () => {
	return {
		id: "agent-auth",
		$InferServerPlugin: {} as ReturnType<typeof agentAuth>,
		pathMethods: {
			"/agent/create": "POST",
			"/agent/update": "POST",
			"/agent/revoke": "POST",
			"/agent/rotate-key": "POST",
		},
		$ERROR_CODES: AGENT_AUTH_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};

export type AgentAuthClientPlugin = ReturnType<typeof agentAuthClient>;

export type * from "./types";
