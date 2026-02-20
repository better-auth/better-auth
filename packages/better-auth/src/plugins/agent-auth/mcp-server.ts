#!/usr/bin/env node
/**
 * Better Auth MCP Gateway.
 *
 * Configure in Cursor / Claude Desktop:
 * ```json
 * {
 *   "mcpServers": {
 *     "better-auth": {
 *       "command": "npx",
 *       "args": ["better-auth-gateway"],
 *       "env": {
 *         "BETTER_AUTH_URL": "http://localhost:3000",
 *         "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..."
 *       }
 *     }
 *   }
 * }
 * ```
 *
 * The gateway fetches its provider config from the app on startup
 * (configured in agentAuth({ mcpProviders: ["github"] })).
 *
 * Only secrets (API keys, tokens) go in env.
 *
 * Environment variables:
 *   BETTER_AUTH_URL             - Your app URL (required for provider auto-discovery)
 *   BETTER_AUTH_ENCRYPTION_KEY  - Encrypt keypairs at rest (recommended for file storage)
 *   BETTER_AUTH_AGENT_COOKIE    - Session cookie for authenticated operations
 *   BETTER_AUTH_AGENT_TOKEN     - Bearer token for authenticated operations
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

import { createFileStorage } from "./mcp-storage-fs";
import { createMemoryStorage } from "./mcp-storage-memory";

interface GatewayConfigResponse {
	providers: (string | { name: string; displayName?: string })[];
}

async function fetchProvidersFromApp(
	appUrl: string,
): Promise<(string | { name: string; displayName?: string })[]> {
	try {
		const res = await globalThis.fetch(
			`${appUrl}/api/auth/agent/gateway-config`,
		);
		if (!res.ok) {
			process.stderr.write(
				`[gateway] Failed to fetch config from ${appUrl}: ${res.status}\n`,
			);
			return [];
		}
		const data = (await res.json()) as GatewayConfigResponse;
		return data.providers ?? [];
	} catch (err) {
		process.stderr.write(`[gateway] Could not reach ${appUrl}: ${err}\n`);
		return [];
	}
}

async function main() {
	const { createGatewayServer } = await import(
		"./gateway/create-gateway-server"
	);

	const appUrl = process.env.BETTER_AUTH_URL;
	const encryptionKey = process.env.BETTER_AUTH_ENCRYPTION_KEY ?? undefined;
	const cookie = process.env.BETTER_AUTH_AGENT_COOKIE ?? undefined;
	const token = process.env.BETTER_AUTH_AGENT_TOKEN ?? undefined;

	const storage = encryptionKey
		? createFileStorage({ encryptionKey })
		: createMemoryStorage();

	let providers: (string | { name: string; displayName?: string })[] = [];
	if (appUrl) {
		providers = await fetchProvidersFromApp(appUrl);
		if (providers.length > 0) {
			process.stderr.write(
				`[gateway] Loaded ${providers.length} provider(s) from ${appUrl}\n`,
			);
		}
	}

	const hasAuthHeaders = !!(cookie || token);

	await createGatewayServer({
		storage,
		providers,
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
