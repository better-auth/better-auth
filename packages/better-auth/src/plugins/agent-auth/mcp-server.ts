/**
 * Standalone MCP server for Agent Auth.
 *
 * Registers agent management tools (connect, list, disconnect, status, request)
 * and uses file-based storage for keypairs and connections.
 *
 * Usage:
 *   npx tsx packages/better-auth/src/plugins/agent-auth/mcp-server.ts
 *
 * Or configure in your MCP client (Cursor, Claude Desktop):
 *   {
 *     "mcpServers": {
 *       "better-auth-agent": {
 *         "command": "npx",
 *         "args": ["tsx", "path/to/mcp-server.ts"],
 *         "env": {
 *           "BETTER_AUTH_AGENT_COOKIE": "<your-session-cookie>"
 *         }
 *       }
 *     }
 *   }
 *
 * Environment variables:
 *   BETTER_AUTH_AGENT_DIR     - Storage directory (default: ~/.better-auth/agents)
 *   BETTER_AUTH_AGENT_COOKIE  - Session cookie value for authenticated operations
 *   BETTER_AUTH_AGENT_TOKEN   - Bearer token for authenticated operations (alternative)
 *
 * Requires: @modelcontextprotocol/sdk (peer dependency)
 */

import { createFileStorage } from "./mcp-storage-fs";
import { createAgentMCPTools } from "./mcp-tools";

async function main() {
	// Dynamic import — @modelcontextprotocol/sdk is a peer dependency
	const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
	const { StdioServerTransport } = await import(
		"@modelcontextprotocol/sdk/server/stdio.js"
	);
	const z = await import("zod");

	const storageDir = process.env.BETTER_AUTH_AGENT_DIR ?? undefined;
	const cookie = process.env.BETTER_AUTH_AGENT_COOKIE ?? undefined;
	const token = process.env.BETTER_AUTH_AGENT_TOKEN ?? undefined;

	const storage = createFileStorage({ directory: storageDir });

	const tools = createAgentMCPTools({
		storage,
		getAuthHeaders: () => {
			const headers: Record<string, string> = {};
			if (cookie) {
				headers.cookie = cookie;
			}
			if (token) {
				headers.authorization = `Bearer ${token}`;
			}
			return headers;
		},
	});

	const server = new McpServer({
		name: "better-auth-agent",
		version: "1.0.0",
	});

	for (const tool of tools) {
		const zodShape: Record<string, ReturnType<typeof z.string>> = {};
		for (const [key, schema] of Object.entries(tool.inputSchema)) {
			zodShape[key] = schema as ReturnType<typeof z.string>;
		}

		server.tool(tool.name, tool.description, zodShape, async (params) => {
			return await tool.handler(params as Record<string, unknown>);
		});
	}

	const transport = new StdioServerTransport();
	await server.connect(transport);

	process.stderr.write("[better-auth-agent] MCP server running on stdio\n");
}

main().catch((err) => {
	process.stderr.write(`[better-auth-agent] Fatal: ${err}\n`);
	process.exit(1);
});
