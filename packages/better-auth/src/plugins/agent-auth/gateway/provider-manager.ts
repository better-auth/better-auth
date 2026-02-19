/**
 * MCP Provider Manager.
 *
 * Manages connections to third-party MCP servers (Google Drive, Slack, etc.).
 * Spawns stdio processes or connects via SSE, discovers tools, and routes
 * tool calls with scope enforcement.
 *
 * The provider manager is the core of the MCP Gateway — it acts as an MCP
 * client to each provider and exposes namespaced tools to agents.
 *
 * Requires: @modelcontextprotocol/sdk (peer dependency)
 */

import type { MCPProviderConfig } from "../types";

/** A tool discovered from a provider, namespaced for the gateway. */
export interface GatewayTool {
	/** Namespaced name: "provider.tool_name" */
	name: string;
	/** Provider this tool belongs to. */
	provider: string;
	/** Original tool name on the provider MCP. */
	originalName: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

/** Result from calling a tool on a provider. */
export interface GatewayToolResult {
	content: Array<{ type: string; text?: string; [key: string]: unknown }>;
	isError?: boolean;
}

interface ManagedProvider {
	config: MCPProviderConfig;
	client: InstanceType<
		typeof import("@modelcontextprotocol/sdk/client/index.js").Client
	>;
	transport:
		| InstanceType<
				typeof import("@modelcontextprotocol/sdk/client/stdio.js").StdioClientTransport
		  >
		| InstanceType<
				typeof import("@modelcontextprotocol/sdk/client/sse.js").SSEClientTransport
		  >;
	tools: GatewayTool[];
}

export interface ProviderManager {
	/** Start all configured providers. Call once on gateway startup. */
	start(): Promise<void>;
	/** Get all discovered tools across all providers. */
	listTools(): GatewayTool[];
	/** Get tools for a specific provider. */
	listProviderTools(providerName: string): GatewayTool[];
	/** Call a namespaced tool (e.g. "google-drive.list_files"). */
	callTool(
		namespacedName: string,
		args: Record<string, unknown>,
	): Promise<GatewayToolResult>;
	/** Check if a namespaced tool name is valid. */
	hasTool(namespacedName: string): boolean;
	/** Parse a namespaced tool name into provider + tool. Returns null if invalid. */
	parseTool(namespacedName: string): {
		provider: string;
		tool: string;
	} | null;
	/** Shut down all provider connections. */
	shutdown(): Promise<void>;
}

/**
 * Create a provider manager from a list of provider configs.
 */
export function createProviderManager(
	providers: MCPProviderConfig[],
): ProviderManager {
	const managed = new Map<string, ManagedProvider>();

	function resolveTransport(config: MCPProviderConfig): "stdio" | "sse" {
		if (config.transport) return config.transport;
		if (config.command) return "stdio";
		if (config.url) return "sse";
		throw new Error(
			`Provider "${config.name}": set command (stdio) or url (sse)`,
		);
	}

	async function startProvider(config: MCPProviderConfig): Promise<void> {
		const { Client } = await import(
			"@modelcontextprotocol/sdk/client/index.js"
		);

		const transportType = resolveTransport(config);
		let transport: ManagedProvider["transport"];

		if (transportType === "stdio") {
			if (!config.command) {
				throw new Error(
					`Provider "${config.name}": stdio transport requires a command`,
				);
			}
			const { StdioClientTransport } = await import(
				"@modelcontextprotocol/sdk/client/stdio.js"
			);
			transport = new StdioClientTransport({
				command: config.command,
				args: config.args ?? [],
				env: {
					...process.env,
					...(config.env ?? {}),
				} as Record<string, string>,
			});
		} else {
			if (!config.url) {
				throw new Error(
					`Provider "${config.name}": sse transport requires a url`,
				);
			}
			const { SSEClientTransport } = await import(
				"@modelcontextprotocol/sdk/client/sse.js"
			);
			transport = new SSEClientTransport(new URL(config.url), {
				requestInit: {
					headers: config.headers ?? {},
				},
			});
		}

		const client = new Client({
			name: `better-auth-gateway/${config.name}`,
			version: "1.0.0",
		});

		await client.connect(transport);

		const { tools: rawTools } = await client.listTools();

		const label = config.displayName ?? config.name;
		const tools: GatewayTool[] = rawTools.map((t) => ({
			name: `${config.name}.${t.name}`,
			provider: config.name,
			originalName: t.name,
			description: `[${label}] ${t.description ?? t.name}`,
			inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
		}));

		managed.set(config.name, { config, client, transport, tools });
	}

	return {
		async start() {
			const results = await Promise.allSettled(
				providers.map((config) => startProvider(config)),
			);

			for (let i = 0; i < results.length; i++) {
				const result = results[i]!;
				if (result.status === "rejected") {
					const providerName = providers[i]?.name ?? "unknown";
					process.stderr.write(
						`[gateway] Failed to start provider "${providerName}": ${result.reason}\n`,
					);
				}
			}
		},

		listTools() {
			const all: GatewayTool[] = [];
			for (const m of managed.values()) {
				all.push(...m.tools);
			}
			return all;
		},

		listProviderTools(providerName: string) {
			return managed.get(providerName)?.tools ?? [];
		},

		hasTool(namespacedName: string) {
			const parsed = this.parseTool(namespacedName);
			if (!parsed) return false;
			const provider = managed.get(parsed.provider);
			if (!provider) return false;
			return provider.tools.some((t) => t.originalName === parsed.tool);
		},

		parseTool(namespacedName: string) {
			const dotIndex = namespacedName.indexOf(".");
			if (dotIndex === -1) return null;
			return {
				provider: namespacedName.slice(0, dotIndex),
				tool: namespacedName.slice(dotIndex + 1),
			};
		},

		async callTool(namespacedName, args) {
			const parsed = this.parseTool(namespacedName);
			if (!parsed) {
				return {
					content: [
						{
							type: "text",
							text: `Invalid tool name "${namespacedName}". Use "provider.tool" format.`,
						},
					],
					isError: true,
				};
			}

			const provider = managed.get(parsed.provider);
			if (!provider) {
				return {
					content: [
						{
							type: "text",
							text: `Provider "${parsed.provider}" not found or not running.`,
						},
					],
					isError: true,
				};
			}

			const result = await provider.client.callTool({
				name: parsed.tool,
				arguments: args,
			});

			return result as GatewayToolResult;
		},

		async shutdown() {
			for (const [name, m] of managed) {
				try {
					await m.client.close();
				} catch {
					process.stderr.write(`[gateway] Error closing provider "${name}"\n`);
				}
			}
			managed.clear();
		},
	};
}
