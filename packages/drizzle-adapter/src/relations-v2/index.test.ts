import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it, vi } from "vitest";
import { drizzleAdapter } from ".";

describe("drizzle relations-v2 adapter", () => {
	it("uses D1 batches for ordered atomic-write results", async () => {
		const userTable = sqliteTable("user", {
			id: text("id").primaryKey(),
			name: text("name").notNull(),
			email: text("email").notNull(),
			emailVerified: integer("emailVerified", { mode: "boolean" }).notNull(),
			image: text("image"),
			createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
			updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
		});
		const user = {
			id: "d1-v2-user",
			name: "D1 v2 User",
			email: "d1-v2@example.com",
			emailVerified: false,
			image: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		const updatedUser = { ...user, name: "Updated D1 v2 User" };
		const insertQuery = { kind: "insert" };
		const updateQuery = { kind: "update" };
		const deleteQuery = { kind: "delete" };
		const deleteManyQuery = { kind: "deleteMany" };
		const deleteWhere = vi
			.fn()
			.mockReturnValueOnce(deleteQuery)
			.mockReturnValueOnce(deleteManyQuery);
		const batch = vi
			.fn()
			.mockResolvedValue([
				[user],
				[updatedUser],
				{ meta: { changes: 1 } },
				{ meta: { changes: 2 } },
			]);
		const transaction = vi.fn();
		const database = {
			_: { fullSchema: { user: userTable } },
			$client: {
				prepare: vi.fn(),
				batch: vi.fn(),
				exec: vi.fn(),
			},
			batch,
			insert: vi.fn(() => ({
				values: vi.fn(() => ({ returning: vi.fn(() => insertQuery) })),
			})),
			update: vi.fn(() => ({
				set: vi.fn(() => ({
					where: vi.fn(() => ({ returning: vi.fn(() => updateQuery) })),
				})),
			})),
			delete: vi.fn(() => ({ where: deleteWhere })),
			transaction,
		};
		const adapter = drizzleAdapter(database, {
			provider: "sqlite",
			schema: { user: userTable },
		})({ secret: "test-secret-that-is-at-least-32-chars-long!!" });

		await expect(
			adapter.commitAtomicWrites?.([
				{ type: "create", model: "user", data: user, forceAllowId: true },
				{
					type: "update",
					model: "user",
					where: [{ field: "id", value: user.id }],
					update: { name: updatedUser.name },
				},
				{
					type: "delete",
					model: "user",
					where: [{ field: "id", value: "deleted-user" }],
				},
				{
					type: "deleteMany",
					model: "user",
					where: [{ field: "email", value: "stale@example.com" }],
				},
			]),
		).resolves.toEqual([
			{ type: "create", record: user },
			{ type: "update", record: updatedUser },
			{ type: "delete", deletedCount: 1 },
			{ type: "deleteMany", deletedCount: 2 },
		]);
		expect(batch).toHaveBeenCalledWith([
			insertQuery,
			updateQuery,
			deleteQuery,
			deleteManyQuery,
		]);
		expect(adapter.options?.adapterConfig.transaction).toBe(false);
		expect(transaction).not.toHaveBeenCalled();
	});
});
