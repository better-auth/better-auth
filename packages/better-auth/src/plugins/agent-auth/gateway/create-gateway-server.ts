/**
 * Programmatic API for creating an MCP Gateway server.
 *
 * Use this to create a custom MCP server with providers configured in code:
 *
 * ```ts
 * // my-gateway.ts
 * import { createGatewayServer } from "better-auth/plugins/agent-auth/mcp-gateway"
 *
 * createGatewayServer({
 *   providers: ["github", "slack", "brave-search"],
 * })
 * ```
 *
 * You can mix strings (known providers) with full configs:
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
 * Env vars (GITHUB_PERSONAL_ACCESS_TOKEN, SLACK_BOT_TOKEN, etc.) are
 * inherited from the parent process — set them in your shell, .env
 * file, or MCP client config:
 *
 * ```json
 * {
 *   "mcpServers": {
 *     "my-gateway": {
 *       "command": "npx",
 *       "args": ["tsx", "my-gateway.ts"],
 *       "env": {
 *         "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_...",
 *         "SLACK_BOT_TOKEN": "xoxb-..."
 *       }
 *     }
 *   }
 * }
 * ```
 *
 * Requires: @modelcontextprotocol/sdk (peer dependency)
 */

import { exec } from "node:child_process";
import { platform } from "node:os";
import { signAgentJWT } from "../crypto";
import { createMemoryStorage } from "../mcp-storage-memory";
import type { MCPAgentStorage } from "../mcp-tools";
import { createAgentMCPTools } from "../mcp-tools";
import type { ProviderManager } from "./provider-manager";
import { createProviderManager } from "./provider-manager";
import type { ProviderInput } from "./providers";
import { resolveProviders } from "./providers";
import { isScopeAllowed } from "./scope-utils";

export interface GatewayServerOptions {
	/**
	 * MCP providers to connect to.
	 *
	 * Pass a string for known providers (auto-resolved),
	 * or a full config object for custom MCP servers.
	 *
	 * @example
	 * ```ts
	 * providers: ["github", "slack", { name: "my-tool", command: "node", args: ["server.js"] }]
	 * ```
	 */
	providers?: ProviderInput[];

	/**
	 * Agent storage backend. Defaults to in-memory storage.
	 *
	 * @example
	 * ```ts
	 * import { createFileStorage } from "better-auth/plugins/agent-auth/mcp-storage-fs"
	 * storage: createFileStorage({ directory: "~/.my-app/agents" })
	 * ```
	 */
	storage?: MCPAgentStorage;

	/**
	 * Auth headers to attach when creating/revoking agents.
	 * If not provided, uses the device authorization flow.
	 */
	getAuthHeaders?: () =>
		| Record<string, string>
		| Promise<Record<string, string>>;

	/**
	 * Called when a verification URL is available during device auth.
	 * Defaults to opening the URL in the system browser.
	 * Set to `false` to disable auto-opening.
	 */
	onVerificationUrl?: ((url: string) => void | Promise<void>) | false;

	/** Client ID for device auth flow. @default "agent-auth" */
	clientId?: string;

	/** MCP server name shown to clients. @default "better-auth-gateway" */
	serverName?: string;
}

function openInBrowser(url: string): void {
	const cmd =
		platform() === "darwin"
			? "open"
			: platform() === "win32"
				? "start"
				: "xdg-open";
	exec(`${cmd} "${url}"`);
}

/**
 * Create and start an MCP Gateway server.
 *
 * This sets up a stdio MCP server that exposes:
 * - Agent management tools (connect_agent, disconnect_agent, etc.)
 * - Namespaced provider tools (e.g. google-drive.list_files)
 *
 * Provider tools are gated by agent scopes — an agent can only call
 * tools it was authorized for during the device auth approval.
 */
export async function createGatewayServer(
	options: GatewayServerOptions = {},
): Promise<void> {
	const {
		providers: rawProviders = [],
		storage = createMemoryStorage(),
		getAuthHeaders,
		onVerificationUrl = openInBrowser,
		clientId,
		serverName = "better-auth-gateway",
	} = options;

	const providers = resolveProviders(rawProviders);

	const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
	const { StdioServerTransport } = await import(
		"@modelcontextprotocol/sdk/server/stdio.js"
	);
	const z = await import("zod");

	const tools = createAgentMCPTools({
		storage,
		getAuthHeaders,
		clientId,
		onVerificationUrl:
			onVerificationUrl === false ? undefined : onVerificationUrl,
	});

	const server = new McpServer({
		name: serverName,
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

	let gateway: ProviderManager | null = null;

	if (providers.length > 0) {
		gateway = createProviderManager(providers);
		await gateway.start();

		const gatewayTools = gateway.listTools();
		process.stderr.write(
			`[gateway] ${gatewayTools.length} tools from ${providers.length} provider(s)\n`,
		);

		for (const gt of gatewayTools) {
			const inputProps: Record<string, unknown> =
				(gt.inputSchema as Record<string, unknown>).properties ??
				gt.inputSchema;

			const zodShape: Record<string, ReturnType<typeof z.string>> = {};
			for (const key of Object.keys(inputProps)) {
				zodShape[key] = z.any().optional().describe(key);
			}

			server.tool(
				gt.name,
				gt.description,
				{
					agentId: z.string().describe("Your Agent ID (from connect_agent)"),
					...zodShape,
				},
				async (params) => {
					const agentId = params.agentId as string;
					if (!agentId) {
						return {
							content: [
								{
									type: "text" as const,
									text: "agentId is required. Call connect_agent first.",
								},
							],
						};
					}

					const connection = await storage.getConnection(agentId);
					if (!connection) {
						return {
							content: [
								{
									type: "text" as const,
									text: `No connection found for agent ${agentId}. Call connect_agent first.`,
								},
							],
						};
					}

					const parsed = gateway!.parseTool(gt.name);
					if (!parsed) {
						return {
							content: [{ type: "text" as const, text: "Invalid tool name." }],
						};
					}

					const providerConfig = providers.find(
						(p) => p.name === parsed.provider,
					);
					if (
						!isScopeAllowed(
							connection.scopes,
							parsed.provider,
							parsed.tool,
							providerConfig,
						)
					) {
						return {
							content: [
								{
									type: "text" as const,
									text: `Scope denied: agent does not have access to "${gt.name}". Agent scopes: ${connection.scopes.join(", ") || "none"}.`,
								},
							],
						};
					}

					const { agentId: _, ...toolArgs } = params;
					const result = await gateway!.callTool(
						gt.name,
						toolArgs as Record<string, unknown>,
					);

					return {
						content: (result.content ?? []).map((c) => ({
							type: (c.type ?? "text") as "text",
							text: c.text ?? JSON.stringify(c),
						})),
					};
				},
			);
		}
	}

	const transport = new StdioServerTransport();
	await server.connect(transport);

	const revokeAll = buildRevokeAll(storage);
	const cleanup = async () => {
		await revokeAll();
		if (gateway) await gateway.shutdown();
	};

	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
		process.on(signal, async () => {
			process.stderr.write(`[${serverName}] ${signal}, cleaning up…\n`);
			await cleanup();
			process.exit(0);
		});
	}

	transport.onclose = async () => {
		process.stderr.write(`[${serverName}] Transport closed, cleaning up…\n`);
		await cleanup();
		process.exit(0);
	};

	const providerInfo =
		providers.length > 0 ? `, ${providers.length} provider(s)` : "";
	process.stderr.write(`[${serverName}] Running on stdio${providerInfo}\n`);
}

function buildRevokeAll(storage: MCPAgentStorage) {
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
				// Best-effort
			}
			await storage.removeConnection(conn.agentId);
		}
	};
}
