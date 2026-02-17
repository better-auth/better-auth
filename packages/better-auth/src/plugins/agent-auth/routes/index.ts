import type { ResolvedAgentAuthOptions } from "../types";
import { createAgent } from "./create-agent";
import { getAgent } from "./get-agent";
import { getAgentActivity } from "./get-agent-activity";
import { getAgentSession } from "./get-agent-session";
import { listAgents } from "./list-agents";
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
	};
}
