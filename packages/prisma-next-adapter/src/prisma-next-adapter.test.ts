import type { BetterAuthOptions } from "@better-auth/core";
import { describe, expect, it, vi } from "vitest";
import { prismaNextAdapter } from "./prisma-next-adapter";

/**
 * Creates a mock Prisma Next collection with fluent API.
 * Each method returns `this` to support chaining, with terminal methods returning promises.
 */
function createMockCollection(overrides: Record<string, any> = {}) {
	const collection: any = {
		where: vi.fn().mockReturnThis(),
		find: vi.fn().mockResolvedValue(null),
		all: vi.fn().mockResolvedValue([]),
		create: vi.fn().mockResolvedValue({}),
		update: vi.fn().mockResolvedValue({}),
		updateAll: vi.fn().mockResolvedValue([]),
		updateCount: vi.fn().mockResolvedValue(0),
		delete: vi.fn().mockResolvedValue({}),
		deleteAll: vi.fn().mockResolvedValue([]),
		deleteCount: vi.fn().mockResolvedValue(0),
		select: vi.fn().mockReturnThis(),
		include: vi.fn().mockReturnThis(),
		orderBy: vi.fn().mockReturnThis(),
		skip: vi.fn().mockReturnThis(),
		take: vi.fn().mockReturnThis(),
		aggregate: vi.fn().mockResolvedValue({ count: 0 }),
		...overrides,
	};
	// Make chainable methods return the collection itself
	collection.where.mockReturnValue(collection);
	collection.select.mockReturnValue(collection);
	collection.include.mockReturnValue(collection);
	collection.orderBy.mockReturnValue(collection);
	collection.skip.mockReturnValue(collection);
	collection.take.mockReturnValue(collection);
	return collection;
}

function createMockDb(models: Record<string, any> = {}) {
	return {
		orm: models,
		transaction: vi.fn(async (cb: any) => cb({ orm: models, transaction: vi.fn() })),
	};
}

describe("prisma-next-adapter", () => {
	const createTestAdapter = (db: Record<string, unknown>) =>
		prismaNextAdapter(db as never, {})({} as BetterAuthOptions);

	it("should create prisma next adapter", () => {
		const db = createMockDb();
		const adapter = prismaNextAdapter(db as never, {});
		expect(adapter).toBeDefined();
		expect(typeof adapter).toBe("function");
	});

	it("should return a DBAdapter when called with options", () => {
		const db = createMockDb({ user: createMockCollection() });
		const adapter = createTestAdapter(db);
		expect(adapter).toBeDefined();
		expect(adapter.id).toBe("prisma-next");
	});

	describe("create", () => {
		it("should create a record", async () => {
			const mockUser = { id: "user-1", email: "test@example.com", name: "Test" };
			const userCollection = createMockCollection({
				create: vi.fn().mockResolvedValue(mockUser),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			const result = await adapter.create({
				model: "user",
				data: { email: "test@example.com", name: "Test" },
			});

			expect(result).toEqual(mockUser);
			expect(userCollection.create).toHaveBeenCalled();
		});

		it("should throw when model does not exist", async () => {
			const db = createMockDb({});
			const adapter = createTestAdapter(db);

			await expect(
				adapter.create({
					model: "nonexistent",
					data: { email: "test@example.com" },
				}),
			).rejects.toThrow(/does not exist/);
		});
	});

	describe("findOne", () => {
		it("should find a record by where clause", async () => {
			const mockUser = { id: "user-1", email: "test@example.com" };
			const userCollection = createMockCollection({
				find: vi.fn().mockResolvedValue(mockUser),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			const result = await adapter.findOne({
				model: "user",
				where: [{ field: "email", value: "test@example.com" }],
			});

			expect(result).toEqual(mockUser);
			expect(userCollection.where).toHaveBeenCalled();
			expect(userCollection.find).toHaveBeenCalled();
		});

		it("should return null when no record found", async () => {
			const userCollection = createMockCollection({
				find: vi.fn().mockResolvedValue(null),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			const result = await adapter.findOne({
				model: "user",
				where: [{ field: "id", value: "nonexistent" }],
			});

			expect(result).toBeNull();
		});

		it("should throw when model does not exist", async () => {
			const db = createMockDb({});
			const adapter = createTestAdapter(db);

			await expect(
				adapter.findOne({
					model: "nonexistent",
					where: [{ field: "id", value: "1" }],
				}),
			).rejects.toThrow(/does not exist/);
		});
	});

	describe("findMany", () => {
		it("should find multiple records", async () => {
			const mockUsers = [
				{ id: "user-1", email: "a@example.com" },
				{ id: "user-2", email: "b@example.com" },
			];
			const userCollection = createMockCollection({
				all: vi.fn().mockResolvedValue(mockUsers),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			const results = await adapter.findMany({
				model: "user",
			});

			expect(results).toEqual(mockUsers);
			expect(userCollection.take).toHaveBeenCalled();
			expect(userCollection.all).toHaveBeenCalled();
		});

		it("should apply limit", async () => {
			const userCollection = createMockCollection({
				all: vi.fn().mockResolvedValue([]),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			await adapter.findMany({
				model: "user",
				limit: 5,
			});

			expect(userCollection.take).toHaveBeenCalledWith(5);
		});

		it("should apply offset", async () => {
			const userCollection = createMockCollection({
				all: vi.fn().mockResolvedValue([]),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			await adapter.findMany({
				model: "user",
				offset: 10,
			});

			expect(userCollection.skip).toHaveBeenCalledWith(10);
		});

		it("should apply sortBy", async () => {
			const userCollection = createMockCollection({
				all: vi.fn().mockResolvedValue([]),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			await adapter.findMany({
				model: "user",
				sortBy: { field: "createdAt", direction: "desc" },
			});

			expect(userCollection.orderBy).toHaveBeenCalledWith({
				createdAt: "desc",
			});
		});
	});

	describe("update", () => {
		it("should update a record", async () => {
			const updatedUser = { id: "user-1", email: "test@example.com", name: "Updated" };
			const userCollection = createMockCollection({
				update: vi.fn().mockResolvedValue(updatedUser),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			const result = await adapter.update({
				model: "user",
				where: [{ field: "id", value: "user-1" }],
				update: { name: "Updated" },
			});

			expect(result).toEqual(updatedUser);
			expect(userCollection.where).toHaveBeenCalled();
		});

		it("should return null when record not found", async () => {
			const error = new Error("No record found");
			(error as any).code = "NOT_FOUND";
			const userCollection = createMockCollection({
				update: vi.fn().mockRejectedValue(error),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			const result = await adapter.update({
				model: "user",
				where: [{ field: "id", value: "nonexistent" }],
				update: { name: "Updated" },
			});

			expect(result).toBeNull();
		});

		it("should propagate non-not-found errors", async () => {
			const error = new Error("Connection failed");
			const userCollection = createMockCollection({
				update: vi.fn().mockRejectedValue(error),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			await expect(
				adapter.update({
					model: "user",
					where: [{ field: "id", value: "user-1" }],
					update: { name: "Updated" },
				}),
			).rejects.toThrow("Connection failed");
		});
	});

	describe("updateMany", () => {
		it("should return count of updated records", async () => {
			const userCollection = createMockCollection({
				updateCount: vi.fn().mockResolvedValue(3),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			const result = await adapter.updateMany({
				model: "user",
				where: [{ field: "role", value: "guest", operator: "eq" }],
				update: { active: false },
			});

			expect(result).toBe(3);
		});
	});

	describe("delete", () => {
		it("should delete a record", async () => {
			const userCollection = createMockCollection({
				delete: vi.fn().mockResolvedValue({ id: "user-1" }),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			await adapter.delete({
				model: "user",
				where: [{ field: "id", value: "user-1" }],
			});

			expect(userCollection.where).toHaveBeenCalled();
			expect(userCollection.delete).toHaveBeenCalled();
		});

		it("should silently handle not-found on delete", async () => {
			const error = new Error("Record to delete does not exist");
			(error as any).code = "P2025";
			const userCollection = createMockCollection({
				delete: vi.fn().mockRejectedValue(error),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			await expect(
				adapter.delete({
					model: "user",
					where: [{ field: "id", value: "nonexistent" }],
				}),
			).resolves.toBeUndefined();
		});
	});

	describe("deleteMany", () => {
		it("should return count of deleted records", async () => {
			const userCollection = createMockCollection({
				deleteCount: vi.fn().mockResolvedValue(5),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			const result = await adapter.deleteMany({
				model: "user",
				where: [{ field: "active", value: false, operator: "eq" }],
			});

			expect(result).toBe(5);
		});
	});

	describe("count", () => {
		it("should return count of matching records", async () => {
			const userCollection = createMockCollection({
				aggregate: vi.fn().mockResolvedValue({ count: 42 }),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			const result = await adapter.count({
				model: "user",
				where: [{ field: "active", value: true, operator: "eq" }],
			});

			expect(result).toBe(42);
		});
	});

	describe("consumeOne", () => {
		it("should delete and return a single record", async () => {
			const mockUser = { id: "user-1", email: "test@example.com" };
			const userCollection = createMockCollection({
				delete: vi.fn().mockResolvedValue(mockUser),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			const result = await adapter.consumeOne({
				model: "user",
				where: [{ field: "id", value: "user-1" }],
			});

			expect(result).toEqual(mockUser);
		});

		it("should return null when no record found", async () => {
			const error = new Error("No record found");
			(error as any).code = "NOT_FOUND";
			const userCollection = createMockCollection({
				delete: vi.fn().mockRejectedValue(error),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			const result = await adapter.consumeOne({
				model: "user",
				where: [{ field: "id", value: "nonexistent" }],
			});

			expect(result).toBeNull();
		});
	});

	describe("where clause translation", () => {
		it("should handle eq operator", async () => {
			const userCollection = createMockCollection({
				find: vi.fn().mockResolvedValue({ id: "1", email: "test@test.com" }),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			await adapter.findOne({
				model: "user",
				where: [{ field: "email", value: "test@test.com", operator: "eq" }],
			});

			expect(userCollection.where).toHaveBeenCalledWith({ email: "test@test.com" });
		});

		it("should handle ne operator", async () => {
			const userCollection = createMockCollection({
				all: vi.fn().mockResolvedValue([]),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			await adapter.findMany({
				model: "user",
				where: [{ field: "role", value: "admin", operator: "ne" }],
			});

			expect(userCollection.where).toHaveBeenCalledWith({
				role: { not: "admin" },
			});
		});

		it("should handle ne with null value", async () => {
			const userCollection = createMockCollection({
				all: vi.fn().mockResolvedValue([]),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			await adapter.findMany({
				model: "user",
				where: [{ field: "deletedAt", value: null, operator: "ne" }],
			});

			expect(userCollection.where).toHaveBeenCalledWith({
				deletedAt: { not: null },
			});
		});

		it("should handle in operator", async () => {
			const userCollection = createMockCollection({
				all: vi.fn().mockResolvedValue([]),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			await adapter.findMany({
				model: "user",
				where: [{ field: "role", value: ["admin", "moderator"], operator: "in" }],
			});

			expect(userCollection.where).toHaveBeenCalledWith({
				role: { in: ["admin", "moderator"] },
			});
		});

		it("should handle gt/gte/lt/lte operators", async () => {
			const userCollection = createMockCollection({
				all: vi.fn().mockResolvedValue([]),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			await adapter.findMany({
				model: "user",
				where: [{ field: "age", value: 18, operator: "gte" }],
			});

			expect(userCollection.where).toHaveBeenCalledWith({
				age: { gte: 18 },
			});
		});

		it("should handle contains operator", async () => {
			const userCollection = createMockCollection({
				all: vi.fn().mockResolvedValue([]),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			await adapter.findMany({
				model: "user",
				where: [{ field: "email", value: "@example.com", operator: "contains" }],
			});

			expect(userCollection.where).toHaveBeenCalledWith({
				email: { contains: "@example.com" },
			});
		});

		it("should handle starts_with operator", async () => {
			const userCollection = createMockCollection({
				all: vi.fn().mockResolvedValue([]),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			await adapter.findMany({
				model: "user",
				where: [{ field: "name", value: "John", operator: "starts_with" }],
			});

			expect(userCollection.where).toHaveBeenCalledWith({
				name: { startsWith: "John" },
			});
		});

		it("should handle ends_with operator", async () => {
			const userCollection = createMockCollection({
				all: vi.fn().mockResolvedValue([]),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			await adapter.findMany({
				model: "user",
				where: [{ field: "email", value: ".com", operator: "ends_with" }],
			});

			expect(userCollection.where).toHaveBeenCalledWith({
				email: { endsWith: ".com" },
			});
		});

		it("should handle insensitive mode", async () => {
			const userCollection = createMockCollection({
				all: vi.fn().mockResolvedValue([]),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			await adapter.findMany({
				model: "user",
				where: [
					{
						field: "email",
						value: "TEST@EXAMPLE.COM",
						operator: "eq",
						mode: "insensitive",
					},
				],
			});

			expect(userCollection.where).toHaveBeenCalledWith({
				email: { equals: "TEST@EXAMPLE.COM", mode: "insensitive" },
			});
		});

		it("should handle AND/OR connectors", async () => {
			const userCollection = createMockCollection({
				all: vi.fn().mockResolvedValue([]),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			await adapter.findMany({
				model: "user",
				where: [
					{ field: "active", value: true, operator: "eq", connector: "AND" },
					{ field: "role", value: "admin", operator: "eq", connector: "OR" },
					{ field: "role", value: "moderator", operator: "eq", connector: "OR" },
				],
			});

			expect(userCollection.where).toHaveBeenCalledWith({
				AND: [{ active: true }],
				OR: [{ role: "admin" }, { role: "moderator" }],
			});
		});

		it("should handle not_in operator with empty array", async () => {
			const userCollection = createMockCollection({
				all: vi.fn().mockResolvedValue([]),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			await adapter.findMany({
				model: "user",
				where: [{ field: "role", value: [], operator: "not_in" }],
			});

			// Empty not_in is a no-op
			expect(userCollection.where).toHaveBeenCalledWith({});
		});

		it("should handle in operator with empty array (impossible condition)", async () => {
			const userCollection = createMockCollection({
				all: vi.fn().mockResolvedValue([]),
			});
			const db = createMockDb({ user: userCollection });
			const adapter = createTestAdapter(db);

			await adapter.findMany({
				model: "user",
				where: [{ field: "role", value: [], operator: "in" }],
			});

			expect(userCollection.where).toHaveBeenCalledWith({
				AND: [
					{ role: { equals: "__never__" } },
					{ role: { not: "__never__" } },
				],
			});
		});
	});

	describe("transaction support", () => {
		it("should support transaction config option", () => {
			const userCollection = createMockCollection();
			const db = createMockDb({ user: userCollection });
			const adapter = prismaNextAdapter(db as never, { transaction: true })(
				{} as BetterAuthOptions,
			);
			expect(adapter).toBeDefined();
		});
	});

	describe("config options", () => {
		it("should support usePlural option", () => {
			const db = createMockDb({ user: createMockCollection() });
			const adapter = prismaNextAdapter(db as never, { usePlural: true })(
				{} as BetterAuthOptions,
			);
			expect(adapter).toBeDefined();
		});

		it("should support debugLogs option", () => {
			const db = createMockDb({ user: createMockCollection() });
			const adapter = prismaNextAdapter(db as never, { debugLogs: true })(
				{} as BetterAuthOptions,
			);
			expect(adapter).toBeDefined();
		});
	});
});
