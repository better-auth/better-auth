/**
 * Standalone MCP server for Agent Auth.
 *
 * Registers agent management tools (connect, list, disconnect, status, request)
 * and uses in-memory storage by default (agents are ephemeral per process).
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
 *   BETTER_AUTH_AGENT_STORAGE - "memory" (default) or "file"
 *   BETTER_AUTH_AGENT_COOKIE  - Session cookie value for authenticated operations
 *   BETTER_AUTH_AGENT_TOKEN   - Bearer token for authenticated operations (alternative)
 *
 * Requires: @modelcontextprotocol/sdk (peer dependency)
 */

import { exec } from "node:child_process";
import { platform } from "node:os";
import { signAgentJWT } from "./crypto";
import { createFileStorage } from "./mcp-storage-fs";
import { createMemoryStorage } from "./mcp-storage-memory";
import type { MCPAgentStorage } from "./mcp-tools";
import { createAgentMCPTools } from "./mcp-tools";

/**
 * Open a URL in the user's default browser.
 * Works cross-platform (macOS, Linux, Windows).
 */
function openInBrowser(url: string): void {
	const cmd =
		platform() === "darwin"
			? "open"
			: platform() === "win32"
				? "start"
				: "xdg-open";
	exec(`${cmd} "${url}"`);
}

async function main() {
	// Dynamic import — @modelcontextprotocol/sdk is a peer dependency
	const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
	const { StdioServerTransport } = await import(
		"@modelcontextprotocol/sdk/server/stdio.js"
	);
	const z = await import("zod");

	const storageDir = process.env.BETTER_AUTH_AGENT_DIR ?? undefined;
	const storageType = process.env.BETTER_AUTH_AGENT_STORAGE ?? "memory";
	const cookie = process.env.BETTER_AUTH_AGENT_COOKIE ?? undefined;
	const token = process.env.BETTER_AUTH_AGENT_TOKEN ?? undefined;

	const storage =
		storageType === "file"
			? createFileStorage({ directory: storageDir })
			: createMemoryStorage();

	const hasAuthHeaders = !!(cookie || token);

	const tools = createAgentMCPTools({
		storage,
		getAuthHeaders: hasAuthHeaders
			? () => {
					const headers: Record<string, string> = {};
					if (cookie) {
						headers.cookie = cookie;
					}
					if (token) {
						headers.authorization = `Bearer ${token}`;
					}
					return headers;
				}
			: undefined,
		onVerificationUrl: (url) => {
			openInBrowser(url);
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

	// Approach 1: Revoke all agents on clean process shutdown
	const revokeAll = buildRevokeAllConnections(storage);
	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
		process.on(signal, async () => {
			process.stderr.write(
				`[better-auth-agent] ${signal} received, revoking agents…\n`,
			);
			await revokeAll();
			process.exit(0);
		});
	}

	// Approach 2: Revoke on stdio pipe close (Cursor tab / window close)
	transport.onclose = async () => {
		process.stderr.write(
			"[better-auth-agent] Transport closed, revoking agents…\n",
		);
		await revokeAll();
		process.exit(0);
	};

	process.stderr.write(
		`[better-auth-agent] MCP server running on stdio (storage: ${storageType})\n`,
	);
}

/**
 * Build a function that revokes every stored agent connection.
 * Best-effort: network failures are silently ignored (server-side TTL
 * is the real safety net for orphaned agents).
 */
function buildRevokeAllConnections(storage: MCPAgentStorage) {
	return async () => {
		const connections = await storage.listConnections();
		for (const conn of connections) {
			const full = await storage.getConnection(conn.agentId);
			if (!full) continue;
			try {
				const jwt = await signAgentJWT({
					agentId: conn.agentId,
					privateKey: full.keypair.privateKey,
				});
				await globalThis.fetch(`${full.appUrl}/api/auth/agent/revoke`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${jwt}`,
					},
					body: JSON.stringify({ agentId: conn.agentId }),
				});
			} catch {
				// Best-effort — server-side TTL handles cleanup
			}
			await storage.removeConnection(conn.agentId);
		}
	};
}

main().catch((err) => {
	process.stderr.write(`[better-auth-agent] Fatal: ${err}\n`);
	process.exit(1);
});
