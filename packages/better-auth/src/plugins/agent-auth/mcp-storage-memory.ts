/**
 * In-memory MCPAgentStorage implementation (default).
 *
 * Agent connections live in memory — they're discarded when the
 * MCP server process exits. Each conversation gets its own agent
 * identity, and stale agents are automatically cleaned up on restart.
 *
 * Every new agent requires explicit user approval via device auth.
 */

import type { AgentConnectionData, MCPAgentStorage } from "./mcp-tools";

export function createMemoryStorage(): MCPAgentStorage {
	const connections = new Map<string, AgentConnectionData>();
	const pendingFlows = new Map<
		string,
		{
			deviceCode: string;
			clientId: string;
			name: string;
			scopes: string[];
		}
	>();

	return {
		async getConnection(agentId) {
			return connections.get(agentId) ?? null;
		},

		async saveConnection(agentId, connection) {
			connections.set(agentId, connection);
		},

		async removeConnection(agentId) {
			connections.delete(agentId);
		},

		async listConnections() {
			return Array.from(connections.entries()).map(([agentId, conn]) => ({
				agentId,
				appUrl: conn.appUrl,
				name: conn.name,
				scopes: conn.scopes,
			}));
		},

		async savePendingFlow(appUrl, flow) {
			pendingFlows.set(appUrl, flow);
		},

		async getPendingFlow(appUrl) {
			return pendingFlows.get(appUrl) ?? null;
		},

		async removePendingFlow(appUrl) {
			pendingFlows.delete(appUrl);
		},
	};
}
