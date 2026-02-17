/**
 * MCP tool definitions for Agent Auth.
 *
 * These are portable tool descriptors that developers register
 * in their MCP servers. The storage layer is injected so this
 * module has no Node.js dependencies.
 */

import * as z from "zod";
import { generateAgentKeypair, signAgentJWT } from "./crypto";

export interface MCPAgentStorage {
	getKeypair(): Promise<{
		privateKey: Record<string, unknown>;
		publicKey: Record<string, unknown>;
		kid: string;
	} | null>;
	saveKeypair(keypair: {
		privateKey: Record<string, unknown>;
		publicKey: Record<string, unknown>;
		kid: string;
	}): Promise<void>;
	getConnection(appUrl: string): Promise<{
		agentId: string;
		name: string;
		scopes: string[];
	} | null>;
	saveConnection(
		appUrl: string,
		connection: { agentId: string; name: string; scopes: string[] },
	): Promise<void>;
	removeConnection(appUrl: string): Promise<void>;
	listConnections(): Promise<
		Array<{
			appUrl: string;
			agentId: string;
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
}

/**
 * Create MCP tool definitions for agent management.
 * Register these in your MCP server via `server.registerTool()`.
 */
export function createAgentMCPTools(
	options: CreateAgentMCPToolsOptions,
): MCPToolDefinition[] {
	const { storage, getAuthHeaders, clientId = "agent-auth" } = options;

	async function resolveAuthHeaders(): Promise<Record<string, string>> {
		if (!getAuthHeaders) return {};
		return await getAuthHeaders();
	}

	async function getOrCreateKeypair() {
		const existing = await storage.getKeypair();
		if (existing) return existing;

		const keypair = await generateAgentKeypair();
		await storage.saveKeypair(keypair);
		return keypair;
	}

	const tools: MCPToolDefinition[] = [
		{
			name: "connect_agent",
			description: getAuthHeaders
				? "Connect to an app as an agent. Auto-generates a keypair if needed and registers the public key with the app."
				: "Start connecting to an app as an agent. Returns a user code that the user must approve in their browser. After approval, call connect_agent_complete to finish.",
			inputSchema: {
				url: z.string().describe("App URL (e.g. https://app-x.com)"),
				name: z.string().optional().describe("Friendly name for this agent"),
				scopes: z.array(z.string()).optional().describe("Scopes to request"),
			},
			handler: async (input) => {
				const url = (input.url as string).replace(/\/+$/, "");
				const name = (input.name as string) ?? "MCP Agent";
				const scopes = (input.scopes as string[]) ?? [];

				const keypair = await getOrCreateKeypair();

				// If auth headers are available, use direct registration
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

					await storage.saveConnection(url, {
						agentId: data.agentId,
						name,
						scopes: data.scopes,
					});

					return {
						content: [
							{
								type: "text" as const,
								text: `Connected to ${url}. Agent ID: ${data.agentId}. Scopes: ${data.scopes.join(", ")}`,
							},
						],
					};
				}

				// Device authorization flow
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
				};

				// Store pending flow so connect_agent_complete can finish
				if (storage.savePendingFlow) {
					await storage.savePendingFlow(url, {
						deviceCode: codeData.device_code,
						clientId,
						name,
						scopes,
					});
				}

				return {
					content: [
						{
							type: "text" as const,
							text: [
								`To connect your agent, open this URL in your browser:`,
								``,
								`  ${codeData.verification_uri_complete}`,
								``,
								`Or go to ${codeData.verification_uri} and enter code: ${codeData.user_code}`,
								``,
								`The code expires in ${Math.floor(codeData.expires_in / 60)} minutes.`,
								``,
								`After approving, call connect_agent_complete with url "${url}" to finish.`,
							].join("\n"),
						},
					],
				};
			},
		},
		{
			name: "list_agents",
			description: "List all connected apps and agent connections.",
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
			description: "Revoke and remove an agent connection.",
			inputSchema: {
				url: z.string().describe("App URL to disconnect from"),
			},
			handler: async (input) => {
				const url = (input.url as string).replace(/\/+$/, "");
				const connection = await storage.getConnection(url);
				if (!connection) {
					return {
						content: [
							{
								type: "text" as const,
								text: `No connection found for ${url}`,
							},
						],
					};
				}

				const keypair = await storage.getKeypair();
				if (keypair) {
					const authHeaders = await resolveAuthHeaders();
					try {
						await globalThis.fetch(`${url}/api/auth/agent/revoke`, {
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								...authHeaders,
							},
							body: JSON.stringify({
								agentId: connection.agentId,
							}),
						});
					} catch {
						// Best-effort server-side revocation
					}
				}

				await storage.removeConnection(url);
				return {
					content: [
						{
							type: "text" as const,
							text: `Disconnected from ${url}. Agent ${connection.agentId} removed.`,
						},
					],
				};
			},
		},
		{
			name: "agent_status",
			description: "Check if an agent connection is healthy.",
			inputSchema: {
				url: z.string().describe("App URL to check"),
			},
			handler: async (input) => {
				const url = (input.url as string).replace(/\/+$/, "");
				const connection = await storage.getConnection(url);
				if (!connection) {
					return {
						content: [
							{
								type: "text" as const,
								text: `No connection for ${url}`,
							},
						],
					};
				}

				const keypair = await storage.getKeypair();
				if (!keypair) {
					return {
						content: [
							{
								type: "text" as const,
								text: "No keypair found.",
							},
						],
					};
				}

				const jwt = await signAgentJWT({
					agentId: connection.agentId,
					privateKey: keypair.privateKey,
				});

				const res = await globalThis.fetch(
					`${url}/api/auth/agent/get-session`,
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
							text: `Healthy. Agent: ${session.agent.name} (${connection.agentId}). User: ${session.user.name} (${session.user.email}). Scopes: ${session.agent.scopes.join(", ")}`,
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
				url: z.string().describe("App URL (must have an existing connection)"),
				path: z.string().describe("API path (e.g. /api/reports/Q4)"),
				method: z.string().optional().describe("HTTP method (default: GET)"),
				body: z.string().optional().describe("Request body as JSON string"),
			},
			handler: async (input) => {
				const appUrl = (input.url as string).replace(/\/+$/, "");
				const reqPath = input.path as string;
				const method = (input.method as string) ?? "GET";
				const body = input.body as string | undefined;

				const connection = await storage.getConnection(appUrl);
				if (!connection) {
					return {
						content: [
							{
								type: "text" as const,
								text: `No connection for ${appUrl}. Run connect_agent first.`,
							},
						],
					};
				}

				const keypair = await storage.getKeypair();
				if (!keypair) {
					return {
						content: [
							{
								type: "text" as const,
								text: "No keypair found.",
							},
						],
					};
				}

				const jwt = await signAgentJWT({
					agentId: connection.agentId,
					privateKey: keypair.privateKey,
				});

				const fullUrl = reqPath.startsWith("http")
					? reqPath
					: `${appUrl}${reqPath}`;

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
				"Complete the agent connection after the user has approved in their browser. Call this after connect_agent.",
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

				const keypair = await getOrCreateKeypair();

				// Poll for the token (try up to 60 times, ~5 min)
				const maxAttempts = 60;
				const interval = 5000;
				let accessToken: string | null = null;

				for (let i = 0; i < maxAttempts; i++) {
					const tokenRes = await globalThis.fetch(
						`${url}/api/auth/device/token`,
						{
							method: "POST",
							headers: {
								"Content-Type": "application/json",
							},
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
						await new Promise((resolve) => setTimeout(resolve, interval));
						continue;
					}
					if (errorData.error === "slow_down") {
						await new Promise((resolve) => setTimeout(resolve, interval * 2));
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

					// Unknown error, abort
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

				// Register the agent
				const createRes = await globalThis.fetch(
					`${url}/api/auth/agent/create`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${accessToken}`,
						},
						body: JSON.stringify({
							name: pendingFlow.name,
							publicKey: keypair.publicKey,
							scopes: pendingFlow.scopes,
						}),
					},
				);

				if (!createRes.ok) {
					const err = await createRes.text();
					if (storage.removePendingFlow) await storage.removePendingFlow(url);
					return {
						content: [
							{
								type: "text" as const,
								text: `Failed to register agent: ${err}`,
							},
						],
					};
				}

				const data = (await createRes.json()) as {
					agentId: string;
					scopes: string[];
				};

				await storage.saveConnection(url, {
					agentId: data.agentId,
					name: pendingFlow.name,
					scopes: data.scopes,
				});

				if (storage.removePendingFlow) await storage.removePendingFlow(url);

				return {
					content: [
						{
							type: "text" as const,
							text: `Connected to ${url}. Agent ID: ${data.agentId}. Scopes: ${data.scopes.join(", ")}`,
						},
					],
				};
			},
		});
	}

	return tools;
}
