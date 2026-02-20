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

	let gateway: ProviderManager | null = null;
	let gatewayTools: Array<{
		name: string;
		provider: string;
		description: string;
		inputSchema: unknown;
	}> = [];

	if (providers.length > 0) {
		gateway = createProviderManager(providers);
		await gateway.start();
		gatewayTools = gateway.listTools();
	}

	const tools = createAgentMCPTools({
		storage,
		getAuthHeaders,
		clientId,
		onVerificationUrl:
			onVerificationUrl === false ? undefined : onVerificationUrl,
		resolveAuthorizationDetails:
			gatewayTools.length > 0
				? (scopes) => {
						return scopes.map((scope) => {
							const dotIdx = scope.indexOf(".");
							if (dotIdx > 0) {
								const provName = scope.slice(0, dotIdx);
								const toolName = scope.slice(dotIdx + 1);
								const match = gatewayTools.find(
									(gt) =>
										gt.provider === provName && gt.originalName === toolName,
								);
								const config = providers.find((p) => p.name === provName);
								return {
									type: "mcp_tool",
									locations: [config?.displayName ?? provName],
									actions: ["execute"],
									identifier: toolName,
									description: match?.description,
								};
							}
							return { type: "mcp_tool", identifier: scope };
						});
					}
				: undefined,
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

	if (gatewayTools.length > 0) {
		process.stderr.write(
			`[gateway] ${gatewayTools.length} tools from ${providers.length} provider(s)\n`,
		);

		server.tool(
			"list_gateway_tools",
			"List all available tools from connected MCP providers. " +
				"Call this BEFORE connect_agent to discover tools and pick scopes.",
			{},
			async () => {
				const byProvider: Record<
					string,
					Array<{ tool: string; description: string }>
				> = {};
				for (const gt of gatewayTools) {
					const scope = `${gt.provider}.${gt.originalName}`;
					const list = byProvider[gt.provider] ?? [];
					list.push({ tool: scope, description: gt.description });
					byProvider[gt.provider] = list;
				}

				const lines: string[] = ["Available gateway tools:\n"];
				for (const [provider, pTools] of Object.entries(byProvider)) {
					const config = providers.find((p) => p.name === provider);
					lines.push(
						`## ${config?.displayName ?? provider} (${pTools.length} tools)`,
					);
					for (const t of pTools) {
						lines.push(`  - ${t.tool}: ${t.description}`);
					}
					lines.push("");
				}
				lines.push(
					"Usage:\n" +
						"1. Pass tool names as scopes to connect_agent.\n" +
						"   Example: scopes=['github.create_issue']\n" +
						"2. Call them via call_gateway_tool.\n" +
						"   Example: call_gateway_tool(agentId: '...', tool: 'github.create_issue', args: '{\"title\": \"...\"}')",
				);

				return {
					content: [{ type: "text" as const, text: lines.join("\n") }],
				};
			},
		);

		server.tool(
			"call_gateway_tool",
			"Call a tool from a connected MCP provider. " +
				"Use list_gateway_tools to see available tools. " +
				"Requires a valid agentId with matching scope.",
			{
				agentId: z.string().describe("Your Agent ID (from connect_agent)"),
				tool: z
					.string()
					.describe(
						"Tool name in provider.tool format (e.g. github.create_issue)",
					),
				args: z
					.string()
					.optional()
					.describe("JSON-encoded arguments to pass to the tool"),
			},
			async (params) => {
				const {
					agentId,
					tool,
					args: argsJson,
				} = params as {
					agentId: string;
					tool: string;
					args?: string;
				};

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

				const dotIdx = tool.indexOf(".");
				if (dotIdx === -1) {
					return {
						content: [
							{
								type: "text" as const,
								text: `Invalid tool name "${tool}". Use "provider.tool" format (e.g. github.create_issue).`,
							},
						],
					};
				}

				const providerName = tool.slice(0, dotIdx);
				const toolName = tool.slice(dotIdx + 1);

				const providerConfig = providers.find((p) => p.name === providerName);
				if (
					!isScopeAllowed(
						connection.scopes,
						providerName,
						toolName,
						providerConfig,
					)
				) {
					return {
						content: [
							{
								type: "text" as const,
								text: `Scope denied: agent does not have access to "${tool}". Agent scopes: ${connection.scopes.join(", ") || "none"}.`,
							},
						],
					};
				}

				const mcpToolName = gatewayTools.find(
					(gt) => gt.provider === providerName && gt.originalName === toolName,
				)?.name;

				if (!mcpToolName) {
					return {
						content: [
							{
								type: "text" as const,
								text: `Tool "${tool}" not found. Use list_gateway_tools to see available tools.`,
							},
						],
					};
				}

				let toolArgs: Record<string, unknown> = {};
				if (argsJson) {
					try {
						toolArgs = JSON.parse(argsJson);
					} catch {
						return {
							content: [
								{
									type: "text" as const,
									text: `Invalid JSON in args: ${argsJson}`,
								},
							],
						};
					}
				}

				const result = await gateway!.callTool(mcpToolName, toolArgs);
				const isError = result.isError ?? false;

				reportActivity(connection, agentId, tool, isError).catch(() => {});

				return {
					content: (result.content ?? []).map((c) => ({
						type: (c.type ?? "text") as "text",
						text: c.text ?? JSON.stringify(c),
					})),
				};
			},
		);
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

/**
 * Fire-and-forget: report a gateway tool call to the app's activity log.
 * Uses the agent's keypair to sign a JWT so the app can verify the caller.
 */
async function reportActivity(
	connection: { appUrl: string; keypair: { privateKey: string } },
	agentId: string,
	tool: string,
	isError: boolean,
): Promise<void> {
	const jwt = await signAgentJWT({
		agentId,
		privateKey: connection.keypair.privateKey,
	});

	await globalThis.fetch(`${connection.appUrl}/api/auth/agent/log-activity`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${jwt}`,
		},
		body: JSON.stringify({
			method: "TOOL",
			path: tool,
			status: isError ? 500 : 200,
		}),
	});
}
