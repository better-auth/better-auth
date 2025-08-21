import { describe, it, expect, beforeEach } from "vitest";
import { createAuth } from "../../auth";
import { m2m } from "./index";
import { createAdapter } from "../../test-utils";

describe("M2M Plugin", () => {
	const adapter = createAdapter();
	const auth = createAuth({
		adapter,
		plugins: [
			m2m({
				enableMetadata: true,
				requireClientName: false,
			}),
		],
	});

	beforeEach(async () => {
		await adapter.clear();
	});

	describe("Client Management", () => {
		it("should create a new M2M client", async () => {
			const response = await auth.api.post("/m2m/clients", {
				name: "Test Client",
				scopes: ["read", "write"],
				metadata: { environment: "test" },
			});

			expect(response.status).toBe(200);
			expect(response.data).toHaveProperty("id");
			expect(response.data).toHaveProperty("clientId");
			expect(response.data).toHaveProperty("clientSecret");
			expect(response.data.name).toBe("Test Client");
			expect(response.data.scopes).toEqual(["read", "write"]);
			expect(response.data.metadata).toEqual({ environment: "test" });
		});

		it("should list M2M clients", async () => {
			// Create a client first
			await auth.api.post("/m2m/clients", {
				name: "Test Client",
				scopes: ["read"],
			});

			const response = await auth.api.get("/m2m/clients");

			expect(response.status).toBe(200);
			expect(Array.isArray(response.data)).toBe(true);
			expect(response.data.length).toBeGreaterThan(0);
			expect(response.data[0]).toHaveProperty("clientId");
			expect(response.data[0]).not.toHaveProperty("clientSecret"); // Should not expose secret
		});

		it("should get a specific M2M client", async () => {
			// Create a client first
			const createResponse = await auth.api.post("/m2m/clients", {
				name: "Test Client",
			});

			const response = await auth.api.get(`/m2m/clients/${createResponse.data.id}`);

			expect(response.status).toBe(200);
			expect(response.data.id).toBe(createResponse.data.id);
			expect(response.data.name).toBe("Test Client");
		});

		it("should update an M2M client", async () => {
			// Create a client first
			const createResponse = await auth.api.post("/m2m/clients", {
				name: "Original Name",
			});

			const response = await auth.api.put(`/m2m/clients/${createResponse.data.id}`, {
				name: "Updated Name",
				scopes: ["read", "write"],
			});

			expect(response.status).toBe(200);
			expect(response.data.name).toBe("Updated Name");
			expect(response.data.scopes).toEqual(["read", "write"]);
		});

		it("should delete an M2M client", async () => {
			// Create a client first
			const createResponse = await auth.api.post("/m2m/clients", {
				name: "Test Client",
			});

			const response = await auth.api.delete(`/m2m/clients/${createResponse.data.id}`);

			expect(response.status).toBe(200);
			expect(response.data.success).toBe(true);
		});
	});

	describe("Token Generation", () => {
		it("should generate access token with valid client credentials", async () => {
			// Create a client first
			const createResponse = await auth.api.post("/m2m/clients", {
				name: "Test Client",
				scopes: ["read", "write"],
			});

			const response = await auth.api.post("/m2m/token", {
				grant_type: "client_credentials",
				client_id: createResponse.data.clientId,
				client_secret: createResponse.data.clientSecret,
				scope: "read write",
			});

			expect(response.status).toBe(200);
			expect(response.data).toHaveProperty("access_token");
			expect(response.data).toHaveProperty("token_type", "bearer");
			expect(response.data).toHaveProperty("expires_in");
			expect(response.data).toHaveProperty("refresh_token");
			expect(response.data).toHaveProperty("scope");
		});

		it("should reject invalid client ID", async () => {
			const response = await auth.api.post("/m2m/token", {
				grant_type: "client_credentials",
				client_id: "invalid-client-id",
				client_secret: "invalid-secret",
			});

			expect(response.status).toBe(401);
			expect(response.data.error).toBe("invalid_client");
		});

		it("should reject invalid client secret", async () => {
			// Create a client first
			const createResponse = await auth.api.post("/m2m/clients", {
				name: "Test Client",
			});

			const response = await auth.api.post("/m2m/token", {
				grant_type: "client_credentials",
				client_id: createResponse.data.clientId,
				client_secret: "invalid-secret",
			});

			expect(response.status).toBe(401);
			expect(response.data.error).toBe("invalid_client");
		});

		it("should reject invalid grant type", async () => {
			const response = await auth.api.post("/m2m/token", {
				grant_type: "authorization_code",
				client_id: "test",
				client_secret: "test",
			});

			expect(response.status).toBe(400);
			expect(response.data.error).toBe("unsupported_grant_type");
		});

		it("should validate scope", async () => {
			// Create a client with limited scopes
			const createResponse = await auth.api.post("/m2m/clients", {
				name: "Test Client",
				scopes: ["read"],
			});

			const response = await auth.api.post("/m2m/token", {
				grant_type: "client_credentials",
				client_id: createResponse.data.clientId,
				client_secret: createResponse.data.clientSecret,
				scope: "read write", // Requesting scope not allowed
			});

			expect(response.status).toBe(400);
			expect(response.data.error).toBe("invalid_scope");
		});

		it("should reject disabled client", async () => {
			// Create a client first
			const createResponse = await auth.api.post("/m2m/clients", {
				name: "Test Client",
			});

			// Disable the client
			await auth.api.put(`/m2m/clients/${createResponse.data.id}`, {
				disabled: true,
			});

			const response = await auth.api.post("/m2m/token", {
				grant_type: "client_credentials",
				client_id: createResponse.data.clientId,
				client_secret: createResponse.data.clientSecret,
			});

			expect(response.status).toBe(401);
			expect(response.data.error).toBe("invalid_client");
		});

		it("should reject expired client", async () => {
			// Create a client with immediate expiration
			const createResponse = await auth.api.post("/m2m/clients", {
				name: "Test Client",
				expiresIn: 0, // Expires immediately
			});

			const response = await auth.api.post("/m2m/token", {
				grant_type: "client_credentials",
				client_id: createResponse.data.clientId,
				client_secret: createResponse.data.clientSecret,
			});

			expect(response.status).toBe(401);
			expect(response.data.error).toBe("invalid_client");
		});
	});

	describe("Validation", () => {
		it("should require client name when required", async () => {
			const authWithRequiredName = createAuth({
				adapter,
				plugins: [
					m2m({
						requireClientName: true,
					}),
				],
			});

			const response = await authWithRequiredName.api.post("/m2m/clients", {});

			expect(response.status).toBe(400);
			expect(response.data.error_description).toContain("Client name is required");
		});

		it("should validate client name length", async () => {
			const response = await auth.api.post("/m2m/clients", {
				name: "a".repeat(101), // Exceeds max length
			});

			expect(response.status).toBe(400);
			expect(response.data.error_description).toContain("Client name must be at most");
		});

		it("should reject metadata when disabled", async () => {
			const authWithoutMetadata = createAuth({
				adapter,
				plugins: [
					m2m({
						enableMetadata: false,
					}),
				],
			});

			const response = await authWithoutMetadata.api.post("/m2m/clients", {
				name: "Test Client",
				metadata: { test: "value" },
			});

			expect(response.status).toBe(400);
			expect(response.data.error_description).toContain("Metadata is disabled");
		});

		it("should validate expiration time", async () => {
			const authWithExpiration = createAuth({
				adapter,
				plugins: [
					m2m({
						clientExpiration: {
							minExpiresIn: 1,
							maxExpiresIn: 30,
						},
					}),
				],
			});

			const response = await authWithExpiration.api.post("/m2m/clients", {
				name: "Test Client",
				expiresIn: 0, // Below minimum
			});

			expect(response.status).toBe(400);
			expect(response.data.error_description).toContain("Expiration must be at least");
		});
	});

	describe("Client Utilities", () => {
		it("should provide client utilities", async () => {
			const client = m2mClient(auth);

			// Test creating a client
			const createResponse = await client.createClient({
				name: "Test Client",
				scopes: ["read"],
			});

			expect(createResponse.data).toHaveProperty("clientId");
			expect(createResponse.data).toHaveProperty("clientSecret");

			// Test listing clients
			const listResponse = await client.listClients();
			expect(Array.isArray(listResponse.data)).toBe(true);

			// Test getting a specific client
			const getResponse = await client.getClient(createResponse.data.id);
			expect(getResponse.data.id).toBe(createResponse.data.id);

			// Test updating a client
			const updateResponse = await client.updateClient(createResponse.data.id, {
				name: "Updated Name",
			});
			expect(updateResponse.data.name).toBe("Updated Name");

			// Test getting access token
			const tokenResponse = await client.getAccessToken({
				clientId: createResponse.data.clientId,
				clientSecret: createResponse.data.clientSecret,
				scope: "read",
			});
			expect(tokenResponse.data).toHaveProperty("access_token");

			// Test deleting a client
			const deleteResponse = await client.deleteClient(createResponse.data.id);
			expect(deleteResponse.data.success).toBe(true);
		});
	});
});

// Helper function to create M2M client utilities
function m2mClient(auth: any) {
	return {
		createClient: async (data: any) => auth.api.post("/m2m/clients", data),
		listClients: async (params?: any) => auth.api.get("/m2m/clients", { params }),
		getClient: async (id: string) => auth.api.get(`/m2m/clients/${id}`),
		updateClient: async (id: string, data: any) => auth.api.put(`/m2m/clients/${id}`, data),
		deleteClient: async (id: string) => auth.api.delete(`/m2m/clients/${id}`),
		getAccessToken: async (data: any) => auth.api.post("/m2m/token", {
			grant_type: "client_credentials",
			client_id: data.clientId,
			client_secret: data.clientSecret,
			scope: data.scope,
		}),
	};
} 