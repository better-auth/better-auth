import { describe, it, expect, beforeEach, vi } from "vitest";
import { adapterRouter } from "../index";
import { memoryAdapter } from "../../memory-adapter/memory-adapter";
import type { BetterAuthOptions } from "../../../types";

// Simple test database type
interface TestDB {
	[key: string]: any[];
}

describe("AdapterRouter", () => {
	let mockOptions: BetterAuthOptions;

	beforeEach(() => {
		mockOptions = {
			database: memoryAdapter({}),
			secret: "test-secret",
		} as BetterAuthOptions;
	});

	describe("Basic Routing", () => {
		it("should route models to correct adapters", async () => {
			const mainDb: TestDB = {};
			const cacheDb: TestDB = {};

			const mainAdapter = memoryAdapter(mainDb);
			const cacheAdapter = memoryAdapter(cacheDb);

			const router = adapterRouter({
				fallbackAdapter: mainAdapter,
				routes: [
					// Sessions go to cache
					({ modelName }) =>
						modelName === "session" ? cacheAdapter(mockOptions) : null,
				],
			});

			const adapter = router(mockOptions);

			// User goes to main (fallback)
			await adapter.create({
				model: "user",
				data: { email: "user@example.com", name: "Test User" },
			});

			// Session goes to cache (routed)
			await adapter.create({
				model: "session",
				data: {
					userId: "user1",
					token: "session-token",
					expiresAt: new Date(),
				},
			});

			// Verify correct routing
			expect(mainDb.user?.length).toBe(1);
			expect(mainDb.session).toBeUndefined();
			expect(cacheDb.session?.length).toBe(1);
			expect(cacheDb.user).toBeUndefined();
		});

		it("should use fallback adapter for non-routed models", async () => {
			const mainDb: TestDB = {};
			const cacheDb: TestDB = {};

			const mainAdapter = memoryAdapter(mainDb);
			const cacheAdapter = memoryAdapter(cacheDb);

			const router = adapterRouter({
				fallbackAdapter: mainAdapter,
				routes: [
					// Only sessions go to cache
					({ modelName }) =>
						modelName === "session" ? cacheAdapter(mockOptions) : null,
				],
			});

			const adapter = router(mockOptions);

			// Account not routed, should use fallback
			await adapter.create({
				model: "account",
				data: { userId: "user1", providerId: "github" },
			});

			expect(mainDb.account?.length).toBe(1);
			expect(cacheDb.account).toBeUndefined();
		});
	});

	describe("Dynamic Routing", () => {
		it("should route premium users to premium storage", async () => {
			const standardDb: TestDB = {};
			const premiumDb: TestDB = {};

			const standardAdapter = memoryAdapter(standardDb);
			const premiumAdapter = memoryAdapter(premiumDb);

			const router = adapterRouter({
				fallbackAdapter: standardAdapter,
				routes: [
					// Premium users get premium storage
					({ data }) =>
						data?.tier === "premium" ? premiumAdapter(mockOptions) : null,
				],
			});

			const adapter = router(mockOptions);

			// Premium user
			await adapter.create({
				model: "user",
				data: {
					email: "vip@company.com",
					name: "VIP User",
					tier: "premium",
				},
			});

			// Standard user (no tier, falls back)
			await adapter.create({
				model: "user",
				data: {
					email: "user@company.com",
					name: "Regular User",
				},
			});

			expect(premiumDb.user?.length).toBe(1);
			expect(premiumDb.user?.[0]?.email).toBe("vip@company.com");
			expect(standardDb.user?.length).toBe(1);
			expect(standardDb.user?.[0]?.email).toBe("user@company.com");
		});

		it("should respect route priority order", async () => {
			const db1: TestDB = {};
			const db2: TestDB = {};
			const fallbackDb: TestDB = {};

			const adapter1 = memoryAdapter(db1);
			const adapter2 = memoryAdapter(db2);
			const fallbackAdapter = memoryAdapter(fallbackDb);

			const router = adapterRouter({
				fallbackAdapter: fallbackAdapter,
				routes: [
					// First route: premium users
					({ data }) =>
						data?.tier === "premium" ? adapter1(mockOptions) : null,

					// Second route: all users (would catch everything, but premium already handled)
					({ modelName }) =>
						modelName === "user" ? adapter2(mockOptions) : null,
				],
			});

			const adapter = router(mockOptions);

			// Premium user - should go to adapter1 (first route wins)
			await adapter.create({
				model: "user",
				data: {
					email: "premium@example.com",
					tier: "premium",
				},
			});

			// Regular user - should go to adapter2 (second route)
			await adapter.create({
				model: "user",
				data: {
					email: "regular@example.com",
				},
			});

			// Session - no routes match, should go to fallback
			await adapter.create({
				model: "session",
				data: {
					userId: "user1",
					token: "token",
					expiresAt: new Date(),
				},
			});

			expect(db1.user?.length).toBe(1); // Premium user
			expect(db1.user?.[0]?.email).toBe("premium@example.com");
			expect(db2.user?.length).toBe(1); // Regular user
			expect(db2.user?.[0]?.email).toBe("regular@example.com");
			expect(fallbackDb.session?.length).toBe(1); // Session
		});

		it("should support async dynamic routing", async () => {
			const usDb: TestDB = {};
			const euDb: TestDB = {};

			const usAdapter = memoryAdapter(usDb);
			const euAdapter = memoryAdapter(euDb);

			const router = adapterRouter({
				fallbackAdapter: usAdapter,
				routes: [
					async ({ data }) => {
						// Simulate async geo lookup
						await new Promise((resolve) => setTimeout(resolve, 1));
						return data?.region === "eu" ? euAdapter(mockOptions) : null;
					},
				],
			});

			const adapter = router(mockOptions);

			// EU user
			await adapter.create({
				model: "user",
				data: {
					email: "eu-user@example.com",
					name: "EU User",
					region: "eu",
				},
			});

			// US user (no region, falls back)
			await adapter.create({
				model: "user",
				data: {
					email: "us-user@example.com",
					name: "US User",
				},
			});

			expect(euDb.user?.length).toBe(1);
			expect(usDb.user?.length).toBe(1);
		});

		it("should handle load balancing reads vs writes", async () => {
			const primaryDb: TestDB = {};
			const replicaDb: TestDB = {};

			// Pre-populate replica with test data
			replicaDb.user = [
				{ id: "1", email: "test@example.com", name: "Test User" },
			];

			const primaryAdapter = memoryAdapter(primaryDb);
			const replicaAdapter = memoryAdapter(replicaDb);

			const router = adapterRouter({
				fallbackAdapter: primaryAdapter,
				routes: [
					({ operation }) => {
						// Reads go to replica, writes go to primary
						return ["findOne", "findMany", "count"].includes(operation)
							? replicaAdapter(mockOptions)
							: null; // Let writes fall through to primary
					},
				],
			});

			const adapter = router(mockOptions);

			// Write operation - should go to primary (fallback)
			await adapter.create({
				model: "user",
				data: { email: "new@example.com", name: "New User" },
			});

			// Read operation - should go to replica
			const user = await adapter.findOne<{ email: string }>({
				model: "user",
				where: [{ field: "email", value: "test@example.com" }],
			});

			expect(primaryDb.user?.length).toBe(1); // Write went to primary
			expect(user?.email).toBe("test@example.com"); // Read from replica
		});

		it("should support dynamic routing returning adapter instances", async () => {
			const standardDb: TestDB = {};
			const premiumDb: TestDB = {};

			const standardAdapter = memoryAdapter(standardDb);
			const premiumAdapter = memoryAdapter(premiumDb);

			const router = adapterRouter({
				fallbackAdapter: standardAdapter,
				routes: [
					({ data }) => {
						// Return adapter instance directly for premium users
						return data?.tier === "premium"
							? premiumAdapter(mockOptions)
							: null;
					},
				],
			});

			const adapter = router(mockOptions);

			// Premium user - should use premium adapter
			await adapter.create({
				model: "user",
				data: {
					email: "vip@company.com",
					name: "VIP User",
					tier: "premium",
				},
			});

			// Standard user - should use fallback adapter
			await adapter.create({
				model: "user",
				data: {
					email: "user@company.com",
					name: "Regular User",
				},
			});

			expect(premiumDb.user?.length).toBe(1);
			expect(premiumDb.user?.[0]?.email).toBe("vip@company.com");
			expect(standardDb.user?.length).toBe(1);
			expect(standardDb.user?.[0]?.email).toBe("user@company.com");
		});

		it("should support async dynamic routing returning adapter instances", async () => {
			const usDb: TestDB = {};
			const euDb: TestDB = {};

			const usAdapter = memoryAdapter(usDb);
			const euAdapter = memoryAdapter(euDb);

			const router = adapterRouter({
				fallbackAdapter: usAdapter,
				routes: [
					async ({ data }) => {
						// Simulate async geo lookup and return adapter instance
						await new Promise((resolve) => setTimeout(resolve, 1));
						return data?.region === "eu" ? euAdapter(mockOptions) : null;
					},
				],
			});

			const adapter = router(mockOptions);

			// EU user
			await adapter.create({
				model: "user",
				data: {
					email: "eu-user@example.com",
					name: "EU User",
					region: "eu",
				},
			});

			// US user (no region, falls back)
			await adapter.create({
				model: "user",
				data: {
					email: "us-user@example.com",
					name: "US User",
				},
			});

			expect(euDb.user?.length).toBe(1);
			expect(usDb.user?.length).toBe(1);
		});
	});

	describe("Real-World Scenarios", () => {
		it("should handle small app with fast sessions", async () => {
			const postgresDb: TestDB = {};
			const memoryDb: TestDB = {};

			const postgresAdapter = memoryAdapter(postgresDb); // Simulating PostgreSQL
			const memoryAdapter_ = memoryAdapter(memoryDb);

			const router = adapterRouter({
				fallbackAdapter: postgresAdapter,
				routes: [
					({ modelName }) =>
						modelName === "session" ? memoryAdapter_(mockOptions) : null,
				],
			});

			const adapter = router(mockOptions);

			// User signup
			const user = await adapter.create({
				model: "user",
				data: { email: "user@app.com", name: "App User" },
			});

			// Session creation
			await adapter.create({
				model: "session",
				data: {
					userId: user.id,
					token: "fast-session",
					expiresAt: new Date(Date.now() + 86400000),
				},
			});

			// User in PostgreSQL, session in memory
			expect(postgresDb.user?.length).toBe(1);
			expect(memoryDb.session?.length).toBe(1);
			expect(memoryDb.session?.[0]?.token).toBe("fast-session");
		});

		it("should handle multi-tenant isolation", async () => {
			const tenant1Db: TestDB = {};
			const tenant2Db: TestDB = {};
			const sharedDb: TestDB = {};

			const sharedAdapter = memoryAdapter(sharedDb);
			const tenant1Adapter = memoryAdapter(tenant1Db);
			const tenant2Adapter = memoryAdapter(tenant2Db);

			const router = adapterRouter({
				fallbackAdapter: sharedAdapter,
				routes: [
					({ data }) => {
						const tenantId = data?.tenantId;
						if (tenantId === "1") return tenant1Adapter(mockOptions);
						if (tenantId === "2") return tenant2Adapter(mockOptions);
						return null; // Fall back to shared
					},
				],
			});

			const adapter = router(mockOptions);

			// Tenant 1 user
			await adapter.create({
				model: "user",
				data: {
					email: "user1@tenant1.com",
					name: "Tenant 1 User",
					tenantId: "1",
				},
			});

			// Tenant 2 user
			await adapter.create({
				model: "user",
				data: {
					email: "user2@tenant2.com",
					name: "Tenant 2 User",
					tenantId: "2",
				},
			});

			// Shared user (no tenantId)
			await adapter.create({
				model: "user",
				data: {
					email: "admin@system.com",
					name: "System Admin",
				},
			});

			expect(tenant1Db.user?.length).toBe(1);
			expect(tenant2Db.user?.length).toBe(1);
			expect(sharedDb.user?.length).toBe(1);
		});

		it("should handle relationships across adapters transparently", async () => {
			const userDb: TestDB = {};
			const accountDb: TestDB = {};

			const userAdapter = memoryAdapter(userDb);
			const accountAdapter = memoryAdapter(accountDb);

			const router = adapterRouter({
				fallbackAdapter: userAdapter,
				routes: [
					({ modelName }) =>
						modelName === "account" ? accountAdapter(mockOptions) : null,
				],
			});

			const adapter = router(mockOptions);

			// Create user and account in different adapters
			const user = await adapter.create({
				model: "user",
				data: { email: "user@example.com", name: "Test User" },
			});

			await adapter.create({
				model: "account",
				data: { userId: user.id, providerId: "github" },
			});

			// Better Auth handles relationships automatically - just use normal adapter calls
			const foundUser = await adapter.findOne<{ email: string }>({
				model: "user",
				where: [{ field: "email", value: "user@example.com" }],
			});

			const userAccounts = await adapter.findMany<{ providerId: string }>({
				model: "account",
				where: [{ field: "userId", value: user.id }],
			});

			expect(foundUser?.email).toBe("user@example.com");
			expect(userAccounts.length).toBe(1);
			expect(userAccounts[0].providerId).toBe("github");
		});

		it("should handle adapter failures gracefully", async () => {
			const workingDb: TestDB = {};

			const workingAdapter = memoryAdapter(workingDb);
			const faultyAdapter = () => ({
				id: "faulty",
				create: async () => {
					throw new Error("Database connection failed");
				},
				findOne: async () => {
					throw new Error("Database connection failed");
				},
				findMany: async () => {
					throw new Error("Database connection failed");
				},
				update: async () => {
					throw new Error("Database connection failed");
				},
				updateMany: async () => {
					throw new Error("Database connection failed");
				},
				delete: async () => {
					throw new Error("Database connection failed");
				},
				deleteMany: async () => {
					throw new Error("Database connection failed");
				},
				count: async () => {
					throw new Error("Database connection failed");
				},
			});

			const router = adapterRouter({
				fallbackAdapter: workingAdapter,
				routes: [
					({ modelName }) => (modelName === "session" ? faultyAdapter() : null),
				],
			});

			const adapter = router(mockOptions);

			// User creation works (uses working adapter)
			const user = await adapter.create({
				model: "user",
				data: { email: "user@example.com", name: "User" },
			});

			expect(user.email).toBe("user@example.com");

			// Session creation fails (uses faulty adapter)
			await expect(
				adapter.create({
					model: "session",
					data: { userId: user.id, token: "token", expiresAt: new Date() },
				}),
			).rejects.toThrow("Database connection failed");
		});
	});

	describe("Configuration", () => {
		it("should support debug logging", async () => {
			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

			const mainAdapter = memoryAdapter({});
			const cacheAdapter = memoryAdapter({});

			const router = adapterRouter({
				fallbackAdapter: mainAdapter,
				routes: [
					({ modelName }) =>
						modelName === "session" ? cacheAdapter(mockOptions) : null,
				],
				debugLogs: true,
			});

			const adapter = router(mockOptions);

			await adapter.create({
				model: "session",
				data: { userId: "1", token: "token", expiresAt: new Date() },
			});

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Route 0 matched for model "session"'),
			);

			consoleSpy.mockRestore();
		});
	});

	describe("All Adapter Methods", () => {
		it("should support all CRUD operations", async () => {
			const db: TestDB = {};
			const mainAdapter = memoryAdapter(db);

			const router = adapterRouter({
				fallbackAdapter: mainAdapter,
			});

			const adapter = router(mockOptions);

			// Create
			const user = await adapter.create({
				model: "user",
				data: { email: "test@example.com", name: "Test User" },
			});

			// Read
			const found = await adapter.findOne<{ email: string }>({
				model: "user",
				where: [{ field: "email", value: "test@example.com" }],
			});

			// Update
			const updated = await adapter.update<{ name: string }>({
				model: "user",
				where: [{ field: "id", value: user.id }],
				update: { name: "Updated User" },
			});

			// Count
			const count = await adapter.count({ model: "user" });

			// Delete
			await adapter.delete({
				model: "user",
				where: [{ field: "id", value: user.id }],
			});

			expect(found?.email).toBe("test@example.com");
			expect(updated?.name).toBe("Updated User");
			expect(count).toBe(1);
		});
	});
});
