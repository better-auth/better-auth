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
	 * Auth headers to attach when creating/revoking agents.
	 * The `/agent/create` endpoint requires a user session, so the MCP
	 * server must forward the user's auth context.
	 *
	 * Can be a static object or a function that resolves dynamically
	 * (e.g. reading a cookie from a config file).
	 */
	getAuthHeaders?: () =>
		| Record<string, string>
		| Promise<Record<string, string>>;
}

/**
 * Create MCP tool definitions for agent management.
 * Register these in your MCP server via `server.registerTool()`.
 */
export function createAgentMCPTools(
	options: CreateAgentMCPToolsOptions,
): MCPToolDefinition[] {
	const { storage, getAuthHeaders } = options;

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

	return [
		{
			name: "connect_agent",
			description:
				"Connect to an app as an agent. Auto-generates a keypair if needed and registers the public key with the app.",
			inputSchema: {
				url: z.string().describe("App URL (e.g. https://app-x.com)"),
				name: z
					.string()
					.optional()
					.describe("Friendly name for this agent"),
				scopes: z
					.array(z.string())
					.optional()
					.describe("Scopes to request"),
			},
			handler: async (input) => {
				const url = (input.url as string).replace(/\/+$/, "");
				const name = (input.name as string) ?? "MCP Agent";
				const scopes = (input.scopes as string[]) ?? [];

				const keypair = await getOrCreateKeypair();
				const authHeaders = await resolveAuthHeaders();

				const res = await globalThis.fetch(
					`${url}/api/auth/agent/create`,
					{
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
					},
				);

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

				// Try to revoke server-side too
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
							text: `Disconnected from ${url}. Agent ${connection.agentId} removed locally${keypair ? " and revoked server-side" : ""}.`,
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
				url: z
					.string()
					.describe("App URL (must have an existing connection)"),
				path: z.string().describe("API path (e.g. /api/reports/Q4)"),
				method: z
					.string()
					.optional()
					.describe("HTTP method (default: GET)"),
				body: z
					.string()
					.optional()
					.describe("Request body as JSON string"),
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
}
