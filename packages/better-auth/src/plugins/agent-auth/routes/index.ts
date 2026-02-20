import type { ResolvedAgentAuthOptions } from "../types";
import { cleanupAgents } from "./cleanup-agents";
import { createAgent } from "./create-agent";
import { gatewayConfig } from "./gateway-config";
import { getAgent } from "./get-agent";
import { getAgentActivity } from "./get-agent-activity";
import { getAgentSession } from "./get-agent-session";
import { listAgents } from "./list-agents";
import { logActivity } from "./log-activity";
import {
	deleteProvider,
	listProviders,
	registerProvider,
} from "./mcp-providers";
import { revokeAgent } from "./revoke-agent";
import { rotateKey } from "./rotate-key";
import { updateAgent } from "./update-agent";

export function createAgentRoutes(opts: ResolvedAgentAuthOptions) {
	return {
		createAgent: createAgent(opts),
		listAgents: listAgents(),
		getAgent: getAgent(),
		updateAgent: updateAgent(),
		revokeAgent: revokeAgent(),
		rotateKey: rotateKey(),
		getAgentSession: getAgentSession(),
		getAgentActivity: getAgentActivity(),
		logActivity: logActivity(),
		cleanupAgents: cleanupAgents(),
		registerProvider: registerProvider(),
		listProviders: listProviders(),
		deleteProvider: deleteProvider(),
		gatewayConfig: gatewayConfig(opts),
	};
}
