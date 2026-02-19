/**
 * Built-in provider registry and resolution.
 *
 * Allows passing just a name string for known MCP servers:
 *
 * ```ts
 * createGatewayServer({
 *   providers: ["github", "slack", "brave-search"],
 * })
 * ```
 *
 * Or mix strings with full configs:
 *
 * ```ts
 * createGatewayServer({
 *   providers: [
 *     "github",
 *     "slack",
 *     { name: "my-tool", command: "node", args: ["my-server.js"] },
 *   ],
 * })
 * ```
 *
 * Env vars are inherited from the parent process — set them in your
 * shell, .env, or MCP client config.
 */

import type { MCPProviderConfig } from "../types";

/**
 * Registry of known MCP servers.
 *
 * Each entry maps a provider name to its npm package and metadata.
 * Env vars (tokens, API keys) are the MCP server's responsibility —
 * they read them from the process environment.
 */
export const registry: Record<
	string,
	{ displayName: string; package: string }
> = {
	github: {
		displayName: "GitHub",
		package: "@modelcontextprotocol/server-github",
	},
	"google-drive": {
		displayName: "Google Drive",
		package: "@modelcontextprotocol/server-gdrive",
	},
	slack: {
		displayName: "Slack",
		package: "@modelcontextprotocol/server-slack",
	},
	"brave-search": {
		displayName: "Brave Search",
		package: "@modelcontextprotocol/server-brave-search",
	},
	filesystem: {
		displayName: "File System",
		package: "@modelcontextprotocol/server-filesystem",
	},
	fetch: {
		displayName: "Fetch",
		package: "@modelcontextprotocol/server-fetch",
	},
	memory: {
		displayName: "Memory",
		package: "@modelcontextprotocol/server-memory",
	},
	postgres: {
		displayName: "PostgreSQL",
		package: "@modelcontextprotocol/server-postgres",
	},
	sqlite: {
		displayName: "SQLite",
		package: "@modelcontextprotocol/server-sqlite",
	},
	"google-maps": {
		displayName: "Google Maps",
		package: "@modelcontextprotocol/server-google-maps",
	},
};

/** Input accepted by the gateway: a known name, or a full config. */
export type ProviderInput = string | MCPProviderConfig;

/**
 * Resolve a provider input (string or config) to a full MCPProviderConfig.
 *
 * - Strings are looked up in the registry and expanded to a stdio config.
 * - Config objects are returned as-is.
 * - Unknown strings throw with a helpful message listing known names.
 */
export function resolveProvider(input: ProviderInput): MCPProviderConfig {
	if (typeof input !== "string") return input;

	const entry = registry[input];
	if (!entry) {
		const known = Object.keys(registry).join(", ");
		throw new Error(
			`Unknown provider "${input}". Known providers: ${known}. ` +
				`For custom MCP servers, pass a config object: { name: "...", command: "..." }`,
		);
	}

	return {
		name: input,
		displayName: entry.displayName,
		command: "npx",
		args: ["-y", entry.package],
	};
}

/**
 * Resolve an array of provider inputs to full configs.
 */
export function resolveProviders(inputs: ProviderInput[]): MCPProviderConfig[] {
	return inputs.map(resolveProvider);
}
