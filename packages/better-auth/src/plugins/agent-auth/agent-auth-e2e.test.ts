/**
 * End-to-end test for Agent Auth.
 *
 * Tests the full flow from agent SDK keypair generation through
 * authenticated requests via both the SDK and MCP tools.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { agentAuth } from ".";
import { agentAuthClient } from "./client";
import { createAgentClient, generateKeypair } from "./agent-client";
import { createAgentMCPTools } from "./mcp-tools";
import type { MCPAgentStorage } from "./mcp-tools";

describe("agent-auth e2e", async () => {
	// =========================================================================
	// TEST INSTANCE SETUP
	// =========================================================================

	const { client, auth, signInWithTestUser, customFetchImpl } =
		await getTestInstance(
			{
				plugins: [
					agentAuth({
						roles: {
							reader: ["reports.read"],
							writer: [
								"reports.read",
								"reports.write",
								"email.send",
							],
						},
						defaultRole: "reader",
					}),
				],
			},
			{
				clientOptions: {
					plugins: [agentAuthClient()],
				},
			},
		);

	const { headers, user } = await signInWithTestUser();

	// Patch globalThis.fetch so MCP tools and agent SDK route through
	// the test instance without needing a real HTTP server.
	const originalFetch = globalThis.fetch;
	beforeAll(() => {
		globalThis.fetch = customFetchImpl as typeof globalThis.fetch;
	});
	afterAll(() => {
		globalThis.fetch = originalFetch;
	});

	// =========================================================================
	// 1. AGENT SDK FLOW
	// =========================================================================

	describe("agent SDK flow", () => {
		let agentId: string;
		let agentClient: ReturnType<typeof createAgentClient>;
		let keypair: Awaited<ReturnType<typeof generateKeypair>>;

		it("should generate a keypair", async () => {
			keypair = await generateKeypair();
			expect(keypair.publicKey).toBeDefined();
			expect(keypair.privateKey).toBeDefined();
			expect(keypair.publicKey.kty).toBe("OKP");
			expect(keypair.publicKey.crv).toBe("Ed25519");
			// Private key should have the 'd' parameter
			expect(keypair.privateKey.d).toBeDefined();
			// Public key should NOT have the 'd' parameter
			expect(keypair.publicKey.d).toBeUndefined();
		});

		it("should register agent via API", async () => {
			const res = await client.agent.create(
				{
					name: "SDK E2E Agent",
					publicKey: keypair.publicKey,
					scopes: ["reports.read", "email.send"],
				},
				{ headers },
			);

			expect(res.error).toBeNull();
			expect(res.data?.agentId).toBeDefined();
			agentId = res.data!.agentId;
		});

		it("should create an authenticated client", () => {
			agentClient = createAgentClient({
				baseURL: "http://localhost:3000",
				agentId,
				privateKey: keypair.privateKey,
			});

			expect(agentClient.agentId).toBe(agentId);
			expect(agentClient.baseURL).toBe("http://localhost:3000");
		});

		it("should resolve agent session via SDK", async () => {
			const session = await agentClient.getSession();
			expect(session).toBeDefined();
			expect(session?.agent.id).toBe(agentId);
			expect(session?.agent.name).toBe("SDK E2E Agent");
			expect(session?.agent.scopes).toEqual([
				"reports.read",
				"email.send",
			]);
			expect(session?.user.id).toBe(user.id);
		});

		it("should make authenticated fetch via SDK", async () => {
			const res = await agentClient.fetch(
				"/api/auth/agent/get-session",
			);
			expect(res.ok).toBe(true);

			const body = (await res.json()) as {
				agent: { id: string; name: string };
				user: { id: string };
			};
			expect(body.agent.id).toBe(agentId);
			expect(body.user.id).toBe(user.id);
		});
	});

	// =========================================================================
	// 2. MCP TOOLS FLOW
	// =========================================================================

	describe("MCP tools flow", () => {
		// In-memory storage for testing (simulates file storage)
		const memoryStorage = createInMemoryStorage();

		const tools = createAgentMCPTools({
			storage: memoryStorage,
			getAuthHeaders: () => {
				// Pass the test user's session headers
				return Object.fromEntries(headers.entries());
			},
		});

		function findTool(name: string) {
			const tool = tools.find((t) => t.name === name);
			if (!tool)
				throw new Error(`Tool ${name} not found in MCP tools`);
			return tool;
		}

		it("should connect via MCP tool", async () => {
			const connectTool = findTool("connect_agent");
			const result = await connectTool.handler({
				url: "http://localhost:3000",
				name: "MCP E2E Agent",
				scopes: ["reports.read", "reports.write"],
			});

			expect(result.content[0].text).toContain("Connected to");
			expect(result.content[0].text).toContain("Agent ID:");
		});

		it("should list connections via MCP tool", async () => {
			const listTool = findTool("list_agents");
			const result = await listTool.handler({});

			expect(result.content[0].text).toContain("http://localhost:3000");
			expect(result.content[0].text).toContain("MCP E2E Agent");
		});

		it("should check status via MCP tool", async () => {
			const statusTool = findTool("agent_status");
			const result = await statusTool.handler({
				url: "http://localhost:3000",
			});

			expect(result.content[0].text).toContain("Healthy");
			expect(result.content[0].text).toContain("MCP E2E Agent");
		});

		it("should make authenticated request via MCP tool", async () => {
			const requestTool = findTool("agent_request");
			const result = await requestTool.handler({
				url: "http://localhost:3000",
				path: "/api/auth/agent/get-session",
				method: "GET",
			});

			expect(result.content[0].text).toContain("200");
			expect(result.content[0].text).toContain("MCP E2E Agent");
		});

		it("should disconnect via MCP tool", async () => {
			const disconnectTool = findTool("disconnect_agent");
			const result = await disconnectTool.handler({
				url: "http://localhost:3000",
			});

			expect(result.content[0].text).toContain("Disconnected");
		});

		it("should show no connections after disconnect", async () => {
			const listTool = findTool("list_agents");
			const result = await listTool.handler({});

			expect(result.content[0].text).toBe("No agent connections.");
		});
	});

	// =========================================================================
	// 3. PORTABLE IDENTITY — same keypair, two registrations
	// =========================================================================

	describe("portable agent identity", () => {
		it("should use same keypair for multiple app registrations", async () => {
			const keypair = await generateKeypair();

			// Register same public key twice with different names/scopes
			const res1 = await client.agent.create(
				{
					name: "Agent for App1",
					publicKey: keypair.publicKey,
					scopes: ["reports.read"],
				},
				{ headers },
			);

			const res2 = await client.agent.create(
				{
					name: "Agent for App2",
					publicKey: keypair.publicKey,
					role: "writer",
				},
				{ headers },
			);

			expect(res1.error).toBeNull();
			expect(res2.error).toBeNull();

			// Both registrations work, but get different agent IDs
			expect(res1.data!.agentId).not.toBe(res2.data!.agentId);

			// Both can authenticate with the same private key
			const client1 = createAgentClient({
				baseURL: "http://localhost:3000",
				agentId: res1.data!.agentId,
				privateKey: keypair.privateKey,
			});

			const client2 = createAgentClient({
				baseURL: "http://localhost:3000",
				agentId: res2.data!.agentId,
				privateKey: keypair.privateKey,
			});

			const session1 = await client1.getSession();
			const session2 = await client2.getSession();

			expect(session1?.agent.name).toBe("Agent for App1");
			expect(session1?.agent.scopes).toEqual(["reports.read"]);

			expect(session2?.agent.name).toBe("Agent for App2");
			expect(session2?.agent.scopes).toEqual([
				"reports.read",
				"reports.write",
				"email.send",
			]);
		});
	});
});

// =============================================================================
// HELPERS
// =============================================================================

/**
 * In-memory implementation of MCPAgentStorage for testing.
 */
function createInMemoryStorage(): MCPAgentStorage {
	let keypair: {
		privateKey: Record<string, unknown>;
		publicKey: Record<string, unknown>;
		kid: string;
	} | null = null;

	const connections = new Map<
		string,
		{ agentId: string; name: string; scopes: string[] }
	>();

	return {
		async getKeypair() {
			return keypair;
		},
		async saveKeypair(kp) {
			keypair = kp;
		},
		async getConnection(appUrl) {
			return connections.get(appUrl) ?? null;
		},
		async saveConnection(appUrl, connection) {
			connections.set(appUrl, connection);
		},
		async removeConnection(appUrl) {
			connections.delete(appUrl);
		},
		async listConnections() {
			return Array.from(connections.entries()).map(([appUrl, c]) => ({
				appUrl,
				...c,
			}));
		},
	};
}
