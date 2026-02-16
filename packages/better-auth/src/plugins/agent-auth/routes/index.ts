import type { ResolvedAgentAuthOptions } from "../types";
import { createAgent } from "./create-agent";
import { listAgents } from "./list-agents";
import { getAgent } from "./get-agent";
import { updateAgent } from "./update-agent";
import { revokeAgent } from "./revoke-agent";
import { rotateKey } from "./rotate-key";
import { getAgentSession } from "./get-agent-session";

export function createAgentRoutes(opts: ResolvedAgentAuthOptions) {
	return {
		createAgent: createAgent(opts),
		listAgents: listAgents(),
		getAgent: getAgent(),
		updateAgent: updateAgent(),
		revokeAgent: revokeAgent(),
		rotateKey: rotateKey(),
		getAgentSession: getAgentSession(),
	};
}
