/**
 * MCP tool definitions for Agent Auth.
 *
 * These are portable tool descriptors that developers register
 * in their MCP servers. The storage layer is injected so this
 * module has no Node.js dependencies.
 *
 * All tools are keyed by `agentId` — each connect_agent call
 * creates a fresh identity. The AI passes the agentId it received
 * to subsequent tools within the same conversation.
 */

import * as z from "zod";
import { generateAgentKeypair, signAgentJWT } from "./crypto";

export interface AgentKeypair {
	privateKey: Record<string, unknown>;
	publicKey: Record<string, unknown>;
	kid: string;
}

export interface AgentConnectionData {
	appUrl: string;
	keypair: AgentKeypair;
	name: string;
	scopes: string[];
}

/**
 * Storage interface for MCP agent tools.
 *
 * Three implementations:
 * - **Memory** (default): agents in-memory, ephemeral
 * - **File**: one file per agent on disk
 * - **Database**: implement this interface with your own DB
 */
export interface MCPAgentStorage {
	/** Get a connection by agent ID (includes keypair). */
	getConnection(agentId: string): Promise<AgentConnectionData | null>;
	/** Save a connection keyed by agent ID. */
	saveConnection(
		agentId: string,
		connection: AgentConnectionData,
	): Promise<void>;
	/** Remove a connection by agent ID. */
	removeConnection(agentId: string): Promise<void>;
	/** List all stored connections. */
	listConnections(): Promise<
		Array<{
			agentId: string;
			appUrl: string;
			name: string;
			scopes: string[];
		}>
	>;

	/** Store a pending device auth flow so connect_complete can finish it. */
	savePendingFlow?(
		appUrl: string,
		flow: {
			deviceCode: string;
			clientId: string;
			name: string;
			scopes: string[];
		},
	): Promise<void>;
	/** Retrieve a pending device auth flow. */
	getPendingFlow?(appUrl: string): Promise<{
		deviceCode: string;
		clientId: string;
		name: string;
		scopes: string[];
	} | null>;
	/** Remove a pending device auth flow. */
	removePendingFlow?(appUrl: string): Promise<void>;
}

export interface MCPToolDefinition {
	name: string;
	description: string;
	inputSchema: Record<string, z.ZodType>;
	handler: (input: Record<string, unknown>) => Promise<{
		content: Array<{ type: "text"; text: string }>;
	}>;
}

export interface CreateAgentMCPToolsOptions {
	storage: MCPAgentStorage;
	/**
	 * Auth headers to attach when creating/revoking agents via direct method.
	 * If not provided, the `connect_agent` tool will use the device
	 * authorization flow instead (recommended).
	 */
	getAuthHeaders?: () =>
		| Record<string, string>
		| Promise<Record<string, string>>;
	/** Client ID for device auth flow. Default: "agent-auth" */
	clientId?: string;
	/**
	 * Called when a verification URL is available during device auth flow.
	 * Use this to automatically open the URL in the user's browser.
	 * Receives the `verification_uri_complete` (with user code pre-filled).
	 */
	onVerificationUrl?: (url: string) => void | Promise<void>;
}

/**
 * Helper: try to register an agent with a token, return the response or null on auth failure.
 */
async function tryRegisterAgent(
	url: string,
	token: string,
	body: { name: string; publicKey: Record<string, unknown>; scopes: string[] },
): Promise<{ agentId: string; scopes: string[] } | null> {
	const res = await globalThis.fetch(`${url}/api/auth/agent/create`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
			Origin: url,
		},
		body: JSON.stringify(body),
	});

	if (res.ok) {
		return (await res.json()) as { agentId: string; scopes: string[] };
	}

	// Auth failure — token expired or invalid
	if (res.status === 401 || res.status === 403) {
		return null;
	}

	// Other error — throw with details
	const err = await res.text();
	throw new Error(`Failed to register agent: ${err}`);
}

/**
 * Create MCP tool definitions for agent management.
 * Register these in your MCP server via `server.registerTool()`.
 */
export function createAgentMCPTools(
	options: CreateAgentMCPToolsOptions,
): MCPToolDefinition[] {
	const {
		storage,
		getAuthHeaders,
		clientId = "agent-auth",
		onVerificationUrl,
	} = options;

	async function resolveAuthHeaders(): Promise<Record<string, string>> {
		if (!getAuthHeaders) return {};
		return await getAuthHeaders();
	}

	/**
	 * Health-check an existing connection. Returns true if the agent session
	 * is still valid on the server, false otherwise.
	 */
	async function isConnectionHealthy(
		agentId: string,
		connection: AgentConnectionData,
	): Promise<boolean> {
		try {
			const jwt = await signAgentJWT({
				agentId,
				privateKey: connection.keypair.privateKey,
			});
			const res = await globalThis.fetch(
				`${connection.appUrl}/api/auth/agent/get-session`,
				{ headers: { Authorization: `Bearer ${jwt}` } },
			);
			return res.ok;
		} catch {
			return false;
		}
	}

	const tools: MCPToolDefinition[] = [
		{
			name: "connect_agent",
			description: getAuthHeaders
				? "Connect to an app as an agent. If an active connection exists for this URL, you'll be prompted to reuse it or create a new identity."
				: "Connect to an app as an agent via device authorization. If an active connection exists for this URL, you'll be prompted to reuse it or create a new identity.",
			inputSchema: {
				url: z.string().describe("App URL (e.g. https://app-x.com)"),
				name: z
					.string()
					.describe(
						"Descriptive name for this agent based on its current task (e.g. 'Code Review Agent', 'Report Generator'). Do not use generic names.",
					),
				scopes: z.array(z.string()).optional().describe("Scopes to request"),
				agentId: z
					.string()
					.optional()
					.describe(
						"Agent ID from a previous connect_agent call. Pass this to reuse an existing connection.",
					),
				forceNew: z
					.boolean()
					.optional()
					.describe(
						"Force creation of a new agent identity even if one already exists for this URL.",
					),
			},
			handler: async (input) => {
				const url = (input.url as string).replace(/\/+$/, "");
				const name = (input.name as string) ?? "MCP Agent";
				const scopes = (input.scopes as string[]) ?? [];
				const existingAgentId = input.agentId as string | undefined;
				const forceNew = (input.forceNew as boolean) ?? false;

				// 1. Explicit agentId — reuse that specific connection
				if (existingAgentId) {
					const existing = await storage.getConnection(existingAgentId);
					if (existing) {
						const healthy = await isConnectionHealthy(
							existingAgentId,
							existing,
						);
						if (healthy) {
							return {
								content: [
									{
										type: "text" as const,
										text: `Reusing connection. Agent ID: ${existingAgentId}. Name: "${existing.name}". URL: ${existing.appUrl}. Scopes: ${existing.scopes.join(", ") || "none"}.`,
									},
								],
							};
						}
					}
				}

				// 2. No explicit agentId and not forcing new — check for existing connection by URL
				if (!forceNew && !existingAgentId) {
					const allConnections = await storage.listConnections();
					const existingForUrl = allConnections.find((c) => c.appUrl === url);
					if (existingForUrl) {
						const existing = await storage.getConnection(
							existingForUrl.agentId,
						);
						if (existing) {
							const healthy = await isConnectionHealthy(
								existingForUrl.agentId,
								existing,
							);
							if (healthy) {
								return {
									content: [
										{
											type: "text" as const,
											text: `Active connection found for ${url}.\nAgent ID: ${existingForUrl.agentId} | Name: "${existingForUrl.name}" | Scopes: ${existingForUrl.scopes.join(", ") || "none"}\n\nTo reuse this identity, call connect_agent with agentId: "${existingForUrl.agentId}".\nTo create a brand new identity, call connect_agent with forceNew: true.`,
										},
									],
								};
							}
							// Stale — clean up
							await storage.removeConnection(existingForUrl.agentId);
						}
					}
				}

				// 3. Create a fresh identity (forceNew, no existing, or stale connection)
				const keypair = await generateAgentKeypair();

				// Direct auth mode (cookie/token in env)
				if (getAuthHeaders) {
					const authHeaders = await resolveAuthHeaders();
					const res = await globalThis.fetch(`${url}/api/auth/agent/create`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							...authHeaders,
						},
						body: JSON.stringify({
							name,
							publicKey: keypair.publicKey,
							scopes,
						}),
					});

					if (!res.ok) {
						const err = await res.text();
						return {
							content: [
								{
									type: "text" as const,
									text: `Failed to connect: ${err}`,
								},
							],
						};
					}

					const data = (await res.json()) as {
						agentId: string;
						scopes: string[];
					};

					await storage.saveConnection(data.agentId, {
						appUrl: url,
						keypair,
						name,
						scopes: data.scopes,
					});

					return {
						content: [
							{
								type: "text" as const,
								text: `Connected to ${url}. Agent ID: ${data.agentId}. Scopes: ${data.scopes.join(", ")}. Use this Agent ID for subsequent requests in this conversation.`,
							},
						],
					};
				}

				// Device authorization flow — every new identity requires explicit approval
				const codeRes = await globalThis.fetch(`${url}/api/auth/device/code`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						client_id: clientId,
						scope: scopes.join(" "),
					}),
				});

				if (!codeRes.ok) {
					const err = await codeRes.text();
					return {
						content: [
							{
								type: "text" as const,
								text: `Failed to start device auth: ${err}`,
							},
						],
					};
				}

				const codeData = (await codeRes.json()) as {
					device_code: string;
					user_code: string;
					verification_uri: string;
					verification_uri_complete: string;
					expires_in: number;
					interval: number;
				};

				// Store pending flow as fallback for connect_agent_complete
				if (storage.savePendingFlow) {
					await storage.savePendingFlow(url, {
						deviceCode: codeData.device_code,
						clientId,
						name,
						scopes,
					});
				}

				// Auto-open browser if callback is provided
				if (onVerificationUrl) {
					try {
						await onVerificationUrl(codeData.verification_uri_complete);
					} catch {
						// Best-effort — fall back to showing the URL
					}
				}

				// Poll for approval
				const maxAttempts = 60;
				const pollInterval = Math.max(5000, (codeData.interval ?? 5) * 1000);
				let accessToken: string | null = null;

				for (let i = 0; i < maxAttempts; i++) {
					await new Promise((resolve) => setTimeout(resolve, pollInterval));

					const tokenRes = await globalThis.fetch(
						`${url}/api/auth/device/token`,
						{
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								grant_type: "urn:ietf:params:oauth:grant-type:device_code",
								device_code: codeData.device_code,
								client_id: clientId,
							}),
						},
					);

					if (tokenRes.ok) {
						const tokenData = (await tokenRes.json()) as {
							access_token: string;
						};
						accessToken = tokenData.access_token;
						break;
					}

					const errorData = (await tokenRes.json()) as {
						error: string;
					};

					if (errorData.error === "authorization_pending") {
						continue;
					}
					if (errorData.error === "slow_down") {
						await new Promise((resolve) => setTimeout(resolve, pollInterval));
						continue;
					}
					if (errorData.error === "access_denied") {
						if (storage.removePendingFlow) await storage.removePendingFlow(url);
						return {
							content: [
								{
									type: "text" as const,
									text: "User denied the connection.",
								},
							],
						};
					}
					if (errorData.error === "expired_token") {
						if (storage.removePendingFlow) await storage.removePendingFlow(url);
						return {
							content: [
								{
									type: "text" as const,
									text: "Device code expired. Please try again.",
								},
							],
						};
					}

					if (storage.removePendingFlow) await storage.removePendingFlow(url);
					return {
						content: [
							{
								type: "text" as const,
								text: `Device auth failed: ${errorData.error}`,
							},
						],
					};
				}

				if (!accessToken) {
					if (storage.removePendingFlow) await storage.removePendingFlow(url);
					return {
						content: [
							{
								type: "text" as const,
								text: "Timed out waiting for approval. Please try again.",
							},
						],
					};
				}

				// Register the agent
				try {
					const data = await tryRegisterAgent(url, accessToken, {
						name,
						publicKey: keypair.publicKey,
						scopes,
					});

					if (!data) {
						if (storage.removePendingFlow) await storage.removePendingFlow(url);
						return {
							content: [
								{
									type: "text" as const,
									text: "Failed to register agent: auth token was rejected.",
								},
							],
						};
					}

					await storage.saveConnection(data.agentId, {
						appUrl: url,
						keypair,
						name,
						scopes: data.scopes,
					});

					if (storage.removePendingFlow) await storage.removePendingFlow(url);

					return {
						content: [
							{
								type: "text" as const,
								text: `Connected to ${url}. Agent ID: ${data.agentId}. Scopes: ${data.scopes.join(", ")}. Use this Agent ID for subsequent requests in this conversation.`,
							},
						],
					};
				} catch (err) {
					if (storage.removePendingFlow) await storage.removePendingFlow(url);
					return {
						content: [
							{
								type: "text" as const,
								text: `${err instanceof Error ? err.message : String(err)}`,
							},
						],
					};
				}
			},
		},
		{
			name: "list_agents",
			description: "List all agent connections.",
			inputSchema: {},
			handler: async () => {
				const connections = await storage.listConnections();
				if (connections.length === 0) {
					return {
						content: [
							{
								type: "text" as const,
								text: "No agent connections.",
							},
						],
					};
				}
				const lines = connections.map(
					(c) =>
						`${c.appUrl} — ${c.name} (${c.agentId}) [${c.scopes.join(", ")}]`,
				);
				return {
					content: [{ type: "text" as const, text: lines.join("\n") }],
				};
			},
		},
		{
			name: "disconnect_agent",
			description: "Revoke and remove an agent connection by agent ID.",
			inputSchema: {
				agentId: z
					.string()
					.describe("Agent ID to disconnect (from connect_agent)"),
			},
			handler: async (input) => {
				const agentId = input.agentId as string;
				const connection = await storage.getConnection(agentId);
				if (!connection) {
					return {
						content: [
							{
								type: "text" as const,
								text: `No connection found for agent ${agentId}.`,
							},
						],
					};
				}

				// Best-effort server-side revocation
				try {
					const jwt = await signAgentJWT({
						agentId,
						privateKey: connection.keypair.privateKey,
					});
					await globalThis.fetch(`${connection.appUrl}/api/auth/agent/revoke`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${jwt}`,
						},
						body: JSON.stringify({ agentId }),
					});
				} catch {
					// Best-effort
				}

				await storage.removeConnection(agentId);
				return {
					content: [
						{
							type: "text" as const,
							text: `Disconnected agent ${agentId} from ${connection.appUrl}.`,
						},
					],
				};
			},
		},
		{
			name: "agent_status",
			description: "Check if an agent connection is healthy.",
			inputSchema: {
				agentId: z.string().describe("Agent ID to check (from connect_agent)"),
			},
			handler: async (input) => {
				const agentId = input.agentId as string;
				const connection = await storage.getConnection(agentId);
				if (!connection) {
					return {
						content: [
							{
								type: "text" as const,
								text: `No connection found for agent ${agentId}.`,
							},
						],
					};
				}

				const jwt = await signAgentJWT({
					agentId,
					privateKey: connection.keypair.privateKey,
				});

				const res = await globalThis.fetch(
					`${connection.appUrl}/api/auth/agent/get-session`,
					{
						headers: { Authorization: `Bearer ${jwt}` },
					},
				);

				if (!res.ok) {
					return {
						content: [
							{
								type: "text" as const,
								text: `Connection unhealthy: ${res.status} ${res.statusText}`,
							},
						],
					};
				}

				const session = (await res.json()) as {
					agent: { name: string; scopes: string[] };
					user: { name: string; email: string };
				};
				return {
					content: [
						{
							type: "text" as const,
							text: `Healthy. Agent: ${session.agent.name} (${agentId}). User: ${session.user.name} (${session.user.email}). Scopes: ${session.agent.scopes.join(", ")}`,
						},
					],
				};
			},
		},
		{
			name: "agent_request",
			description:
				"Make an authenticated request to a connected app as the agent. Signs a fresh JWT automatically.",
			inputSchema: {
				agentId: z.string().describe("Agent ID (from connect_agent)"),
				path: z.string().describe("API path (e.g. /api/reports/Q4)"),
				method: z.string().optional().describe("HTTP method (default: GET)"),
				body: z.string().optional().describe("Request body as JSON string"),
			},
			handler: async (input) => {
				const agentId = input.agentId as string;
				const reqPath = input.path as string;
				const method = (input.method as string) ?? "GET";
				const body = input.body as string | undefined;

				const connection = await storage.getConnection(agentId);
				if (!connection) {
					return {
						content: [
							{
								type: "text" as const,
								text: `No connection found for agent ${agentId}. Run connect_agent first.`,
							},
						],
					};
				}

				const jwt = await signAgentJWT({
					agentId,
					privateKey: connection.keypair.privateKey,
				});

				const fullUrl = reqPath.startsWith("http")
					? reqPath
					: `${connection.appUrl}${reqPath}`;

				const headers: Record<string, string> = {
					Authorization: `Bearer ${jwt}`,
				};
				if (body) {
					headers["Content-Type"] = "application/json";
				}

				const res = await globalThis.fetch(fullUrl, {
					method,
					headers,
					body: body ?? undefined,
				});

				const text = await res.text();
				return {
					content: [
						{
							type: "text" as const,
							text: `${res.status} ${res.statusText}\n${text}`,
						},
					],
				};
			},
		},
	];

	// Only add connect_agent_complete when using device auth flow
	if (!getAuthHeaders) {
		tools.push({
			name: "connect_agent_complete",
			description:
				"Complete the agent connection after the user has approved in their browser. Call this after connect_agent if the automatic polling timed out.",
			inputSchema: {
				url: z.string().describe("App URL (same one used in connect_agent)"),
			},
			handler: async (input) => {
				const url = (input.url as string).replace(/\/+$/, "");

				const pendingFlow = storage.getPendingFlow
					? await storage.getPendingFlow(url)
					: null;
				if (!pendingFlow) {
					return {
						content: [
							{
								type: "text" as const,
								text: `No pending connection for ${url}. Run connect_agent first.`,
							},
						],
					};
				}

				const keypair = await generateAgentKeypair();

				// Poll for the token
				const maxAttempts = 60;
				const pollInterval = 5000;
				let accessToken: string | null = null;

				for (let i = 0; i < maxAttempts; i++) {
					const tokenRes = await globalThis.fetch(
						`${url}/api/auth/device/token`,
						{
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								grant_type: "urn:ietf:params:oauth:grant-type:device_code",
								device_code: pendingFlow.deviceCode,
								client_id: pendingFlow.clientId,
							}),
						},
					);

					if (tokenRes.ok) {
						const tokenData = (await tokenRes.json()) as {
							access_token: string;
						};
						accessToken = tokenData.access_token;
						break;
					}

					const errorData = (await tokenRes.json()) as {
						error: string;
					};

					if (errorData.error === "authorization_pending") {
						await new Promise((resolve) => setTimeout(resolve, pollInterval));
						continue;
					}
					if (errorData.error === "slow_down") {
						await new Promise((resolve) =>
							setTimeout(resolve, pollInterval * 2),
						);
						continue;
					}
					if (errorData.error === "access_denied") {
						if (storage.removePendingFlow) await storage.removePendingFlow(url);
						return {
							content: [
								{
									type: "text" as const,
									text: "User denied the connection.",
								},
							],
						};
					}
					if (errorData.error === "expired_token") {
						if (storage.removePendingFlow) await storage.removePendingFlow(url);
						return {
							content: [
								{
									type: "text" as const,
									text: "Device code expired. Please run connect_agent again.",
								},
							],
						};
					}

					if (storage.removePendingFlow) await storage.removePendingFlow(url);
					return {
						content: [
							{
								type: "text" as const,
								text: `Device auth failed: ${errorData.error}`,
							},
						],
					};
				}

				if (!accessToken) {
					if (storage.removePendingFlow) await storage.removePendingFlow(url);
					return {
						content: [
							{
								type: "text" as const,
								text: "Timed out waiting for approval. Run connect_agent again.",
							},
						],
					};
				}

				try {
					const data = await tryRegisterAgent(url, accessToken, {
						name: pendingFlow.name,
						publicKey: keypair.publicKey,
						scopes: pendingFlow.scopes,
					});

					if (!data) {
						if (storage.removePendingFlow) await storage.removePendingFlow(url);
						return {
							content: [
								{
									type: "text" as const,
									text: "Failed to register agent: auth token was rejected.",
								},
							],
						};
					}

					await storage.saveConnection(data.agentId, {
						appUrl: url,
						keypair,
						name: pendingFlow.name,
						scopes: data.scopes,
					});

					if (storage.removePendingFlow) await storage.removePendingFlow(url);

					return {
						content: [
							{
								type: "text" as const,
								text: `Connected to ${url}. Agent ID: ${data.agentId}. Scopes: ${data.scopes.join(", ")}. Use this Agent ID for subsequent requests in this conversation.`,
							},
						],
					};
				} catch (err) {
					if (storage.removePendingFlow) await storage.removePendingFlow(url);
					return {
						content: [
							{
								type: "text" as const,
								text: `${err instanceof Error ? err.message : String(err)}`,
							},
						],
					};
				}
			},
		});
	}

	return tools;
}
