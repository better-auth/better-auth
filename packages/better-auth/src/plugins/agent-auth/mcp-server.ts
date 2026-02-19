#!/usr/bin/env node
/**
 * Better Auth MCP Gateway.
 *
 * Run directly via npx:
 *   npx better-auth-gateway
 *
 * Configure in Cursor / Claude Desktop:
 * ```json
 * {
 *   "mcpServers": {
 *     "better-auth-agent": {
 *       "command": "npx",
 *       "args": ["better-auth-gateway"],
 *       "env": {
 *         "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_...",
 *         "BETTER_AUTH_PROVIDERS": "github"
 *       }
 *     }
 *   }
 * }
 * ```
 *
 * Environment variables:
 *   BETTER_AUTH_PROVIDERS       - Comma-separated provider names (e.g. "github,slack")
 *   BETTER_AUTH_AGENT_STORAGE   - "memory" (default) or "file"
 *   BETTER_AUTH_AGENT_DIR       - Storage directory (default: ~/.better-auth/agents)
 *   BETTER_AUTH_AGENT_COOKIE    - Session cookie for authenticated operations
 *   BETTER_AUTH_AGENT_TOKEN     - Bearer token for authenticated operations
 *   BETTER_AUTH_MCP_PROVIDERS   - Path to a JSON config file (advanced, overrides BETTER_AUTH_PROVIDERS)
 *
 * For programmatic setup, use createGatewayServer instead:
 * ```ts
 * import { createGatewayServer } from "better-auth/plugins/agent-auth/mcp-gateway"
 *
 * createGatewayServer({
 *   providers: ["github", "slack"],
 * })
 * ```
 *
 * Requires: @modelcontextprotocol/sdk (peer dependency)
 */

import { readFileSync } from "node:fs";
import { createFileStorage } from "./mcp-storage-fs";
import { createMemoryStorage } from "./mcp-storage-memory";
import type { MCPProviderConfig } from "./types";

function loadProviders(): (string | MCPProviderConfig)[] {
	const names = process.env.BETTER_AUTH_PROVIDERS;
	if (names) {
		return names
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
	}

	const configPath = process.env.BETTER_AUTH_MCP_PROVIDERS;
	if (configPath) {
		try {
			const raw = readFileSync(configPath, "utf-8");
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed : (parsed.providers ?? []);
		} catch (err) {
			process.stderr.write(
				`[gateway] Failed to load providers from ${configPath}: ${err}\n`,
			);
		}
	}

	return [];
}

async function main() {
	const { createGatewayServer } = await import(
		"./gateway/create-gateway-server"
	);

	const storageDir = process.env.BETTER_AUTH_AGENT_DIR ?? undefined;
	const storageType = process.env.BETTER_AUTH_AGENT_STORAGE ?? "memory";
	const cookie = process.env.BETTER_AUTH_AGENT_COOKIE ?? undefined;
	const token = process.env.BETTER_AUTH_AGENT_TOKEN ?? undefined;

	const storage =
		storageType === "file"
			? createFileStorage({ directory: storageDir })
			: createMemoryStorage();

	const hasAuthHeaders = !!(cookie || token);

	await createGatewayServer({
		storage,
		providers: loadProviders(),
		getAuthHeaders: hasAuthHeaders
			? () => {
					const headers: Record<string, string> = {};
					if (cookie) headers.cookie = cookie;
					if (token) headers.authorization = `Bearer ${token}`;
					return headers;
				}
			: undefined,
		serverName: "better-auth-agent",
	});
}

main().catch((err) => {
	process.stderr.write(`[better-auth-agent] Fatal: ${err}\n`);
	process.exit(1);
});
