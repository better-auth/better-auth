/**
 * End-to-end test for Agent Auth.
 *
 * Tests the full flow from agent SDK keypair generation through
 * authenticated requests via both the SDK and MCP tools.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { deviceAuthorization } from "../device-authorization";
import { agentAuth } from ".";
import {
	connectAgent,
	createAgentClient,
	generateKeypair,
} from "./agent-client";
import { agentAuthClient } from "./client";
import type { MCPAgentStorage } from "./mcp-tools";
import { createAgentMCPTools } from "./mcp-tools";

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
							writer: ["reports.read", "reports.write", "email.send"],
						},
						defaultRole: "reader",
					}),
					deviceAuthorization(),
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
			expect(session?.agent.scopes).toEqual(["reports.read", "email.send"]);
			expect(session?.user.id).toBe(user.id);
		});

		it("should make authenticated fetch via SDK", async () => {
			const res = await agentClient.fetch("/api/auth/agent/get-session");
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
		// In-memory storage for testing
		const memoryStorage = createInMemoryStorage();
		let connectedAgentId: string;

		const tools = createAgentMCPTools({
			storage: memoryStorage,
			getAuthHeaders: () => {
				// Pass the test user's session headers
				return Object.fromEntries(headers.entries());
			},
		});

		function findTool(name: string) {
			const tool = tools.find((t) => t.name === name);
			if (!tool) throw new Error(`Tool ${name} not found in MCP tools`);
			return tool;
		}

		it("should connect via MCP tool", async () => {
			const connectTool = findTool("connect_agent");
			const result = await connectTool.handler({
				url: "http://localhost:3000",
				name: "MCP E2E Agent",
				scopes: ["reports.read", "reports.write"],
			});

			expect(result.content[0]!.text).toContain("Connected to");
			expect(result.content[0]!.text).toContain("Agent ID:");

			// Extract agentId for subsequent tests
			const match = result.content[0]!.text.match(/Agent ID:\s*(\S+)\./);
			expect(match).toBeTruthy();
			connectedAgentId = match![1]!;
		});

		it("should list connections via MCP tool", async () => {
			const listTool = findTool("list_agents");
			const result = await listTool.handler({});

			expect(result.content[0]!.text).toContain("http://localhost:3000");
			expect(result.content[0]!.text).toContain("MCP E2E Agent");
		});

		it("should check status via MCP tool", async () => {
			const statusTool = findTool("agent_status");
			const result = await statusTool.handler({
				agentId: connectedAgentId,
			});

			expect(result.content[0]!.text).toContain("Healthy");
			expect(result.content[0]!.text).toContain("MCP E2E Agent");
		});

		it("should make authenticated request via MCP tool", async () => {
			const requestTool = findTool("agent_request");
			const result = await requestTool.handler({
				agentId: connectedAgentId,
				path: "/api/auth/agent/get-session",
				method: "GET",
			});

			expect(result.content[0]!.text).toContain("200");
			expect(result.content[0]!.text).toContain("MCP E2E Agent");
		});

		it("should prompt about existing connection when calling connect_agent again without agentId", async () => {
			const connectTool = findTool("connect_agent");
			const result = await connectTool.handler({
				url: "http://localhost:3000",
				name: "Different Name Attempt",
				scopes: ["reports.read"],
			});

			expect(result.content[0]!.text).toContain("Active connection found");
			expect(result.content[0]!.text).toContain(connectedAgentId);
			expect(result.content[0]!.text).toContain(
				"call connect_agent with agentId",
			);
			expect(result.content[0]!.text).toContain("forceNew: true");
		});

		it("should reuse identity when agentId is explicitly passed", async () => {
			const connectTool = findTool("connect_agent");
			const result = await connectTool.handler({
				url: "http://localhost:3000",
				name: "Same Agent",
				agentId: connectedAgentId,
			});

			expect(result.content[0]!.text).toContain("Reusing connection");
			expect(result.content[0]!.text).toContain(connectedAgentId);
		});

		it("should disconnect via MCP tool", async () => {
			const disconnectTool = findTool("disconnect_agent");
			const result = await disconnectTool.handler({
				agentId: connectedAgentId,
			});

			expect(result.content[0]!.text).toContain("Disconnected");
		});

		it("should show no connections after disconnect", async () => {
			const listTool = findTool("list_agents");
			const result = await listTool.handler({});

			expect(result.content[0]!.text).toBe("No agent connections.");
		});
	});

	// =========================================================================
	// 3. DEVICE AUTH CONNECT FLOW
	// =========================================================================

	describe("device auth connect flow", () => {
		it("should connect via connectAgent with device auth", async () => {
			let capturedUserCode = "";
			let _capturedVerificationUri = "";

			// Start connectAgent in the background — it will request a device
			// code and then poll. We simulate browser approval in between.
			const connectPromise = connectAgent({
				appURL: "http://localhost:3000",
				name: "Device Auth Agent",
				scopes: ["reports.read"],
				pollInterval: 500,
				timeout: 15_000,
				onUserCode: (info) => {
					capturedUserCode = info.userCode;
					_capturedVerificationUri = info.verificationUri;
				},
			});

			// Wait a tick for the device code request to complete
			await new Promise((resolve) => setTimeout(resolve, 200));

			// Verify we got a user code
			expect(capturedUserCode).toBeTruthy();
			expect(capturedUserCode.length).toBeGreaterThan(0);

			// Simulate user approving in the browser (using server API directly)
			const approveRes = await auth.api.deviceApprove({
				body: { userCode: capturedUserCode },
				headers,
			});
			expect("success" in approveRes && approveRes.success).toBe(true);

			// Now connectAgent's polling should pick up the approval
			const result = await connectPromise;

			expect(result.agentId).toBeDefined();
			expect(result.name).toBe("Device Auth Agent");
			expect(result.scopes).toEqual(["reports.read"]);
			expect(result.publicKey).toBeDefined();
			expect(result.privateKey).toBeDefined();

			// Verify the agent can authenticate
			const agentClient = createAgentClient({
				baseURL: "http://localhost:3000",
				agentId: result.agentId,
				privateKey: result.privateKey,
			});

			const session = await agentClient.getSession();
			expect(session?.agent.id).toBe(result.agentId);
			expect(session?.agent.name).toBe("Device Auth Agent");
			expect(session?.user.id).toBe(user.id);
		});

		it("should work with MCP tools in device auth mode", async () => {
			const memStorage = createInMemoryStorage();
			let capturedUrl = "";

			const tools = createAgentMCPTools({
				storage: memStorage,
				onVerificationUrl: (url) => {
					capturedUrl = url;
				},
			});

			const connectTool = tools.find((t) => t.name === "connect_agent")!;
			expect(connectTool).toBeDefined();

			// Start connection in background — it auto-polls for approval
			const connectPromise = connectTool.handler({
				url: "http://localhost:3000",
				name: "MCP Device Agent",
				scopes: ["reports.read"],
			});

			// Wait for the device code request to complete
			await new Promise((resolve) => setTimeout(resolve, 200));

			// Extract user code from the captured verification URL
			expect(capturedUrl).toBeTruthy();
			const urlObj = new URL(capturedUrl);
			const userCode = urlObj.searchParams.get("user_code");
			expect(userCode).toBeTruthy();

			// Simulate user approval in the browser
			await auth.api.deviceApprove({
				body: { userCode: userCode! },
				headers,
			});

			// The connect_agent poll picks up approval and registers the agent
			const result = await connectPromise;
			expect(result.content[0]!.text).toContain("Connected to");
			expect(result.content[0]!.text).toContain("Agent ID:");

			// Verify connection was saved
			const listTool = tools.find((t) => t.name === "list_agents")!;
			const listResult = await listTool.handler({});
			expect(listResult.content[0]!.text).toContain("MCP Device Agent");
		});
	});

	// =========================================================================
	// 4. PORTABLE IDENTITY — same keypair, two registrations
	// =========================================================================

	describe("idempotent agent upsert", () => {
		it("should upsert agent when same keypair is registered twice", async () => {
			const keypair = await generateKeypair();

			const res1 = await client.agent.create(
				{
					name: "Original Agent",
					publicKey: keypair.publicKey,
					scopes: ["reports.read"],
				},
				{ headers },
			);

			const res2 = await client.agent.create(
				{
					name: "Updated Agent",
					publicKey: keypair.publicKey,
					role: "writer",
				},
				{ headers },
			);

			expect(res1.error).toBeNull();
			expect(res2.error).toBeNull();

			// Same kid + same user = same agent (upsert, not duplicate)
			expect(res1.data!.agentId).toBe(res2.data!.agentId);

			// Session reflects the updated name and scopes from the second call
			const agentClient = createAgentClient({
				baseURL: "http://localhost:3000",
				agentId: res1.data!.agentId,
				privateKey: keypair.privateKey,
			});

			const session = await agentClient.getSession();
			expect(session?.agent.name).toBe("Updated Agent");
			expect(session?.agent.scopes).toEqual([
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
 * Matches the new agentId-keyed interface.
 */
function createInMemoryStorage(): MCPAgentStorage {
	const connections = new Map<
		string,
		{
			appUrl: string;
			keypair: {
				privateKey: Record<string, unknown>;
				publicKey: Record<string, unknown>;
				kid: string;
			};
			name: string;
			scopes: string[];
		}
	>();

	const pendingFlows = new Map<
		string,
		{
			deviceCode: string;
			clientId: string;
			name: string;
			scopes: string[];
		}
	>();

	return {
		async getConnection(agentId) {
			return connections.get(agentId) ?? null;
		},
		async saveConnection(agentId, connection) {
			connections.set(agentId, connection);
		},
		async removeConnection(agentId) {
			connections.delete(agentId);
		},
		async listConnections() {
			return Array.from(connections.entries()).map(([agentId, c]) => ({
				agentId,
				appUrl: c.appUrl,
				name: c.name,
				scopes: c.scopes,
			}));
		},
		async savePendingFlow(appUrl, flow) {
			pendingFlows.set(appUrl, flow);
		},
		async getPendingFlow(appUrl) {
			return pendingFlows.get(appUrl) ?? null;
		},
		async removePendingFlow(appUrl) {
			pendingFlows.delete(appUrl);
		},
	};
}
