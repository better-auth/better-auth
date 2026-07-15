import { DatabaseSync } from "node:sqlite";
import type { BetterAuthOptions } from "@better-auth/core";
import type { User } from "@better-auth/core/db";
import type { D1Database } from "@cloudflare/workers-types";
import { Kysely, SqliteDialect } from "kysely";
import { describe, expect, it, vi } from "vitest";
import { createKyselyAdapter } from "./dialect";
import { kyselyAdapter } from "./kysely-adapter";
import { NodeSqliteDialect } from "./node-sqlite-dialect";

describe("kysely-adapter", () => {
	it("should create kysely adapter", () => {
		const db = new Kysely({
			dialect: new SqliteDialect({
				database: {
					close: () => {},
					prepare: () =>
						({
							all: () => [],
							run: () => {},
							get: () => {},
							iterate: () => [],
						}) as any,
				} as any,
			}),
		});
		const adapter = kyselyAdapter(db);
		expect(adapter).toBeDefined();
	});

	it("commits and rolls back transactions for a dialect-backed database", async () => {
		const database = new DatabaseSync(":memory:");
		try {
			database.exec(`
			CREATE TABLE user (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				email TEXT NOT NULL UNIQUE,
				emailVerified INTEGER NOT NULL,
				image TEXT,
				createdAt INTEGER NOT NULL,
				updatedAt INTEGER NOT NULL
			)
		`);
			const options = { database } satisfies BetterAuthOptions;
			const { kysely, databaseType, transaction } =
				await createKyselyAdapter(options);
			if (!kysely) throw new Error("Expected a Kysely database");
			const adapter = kyselyAdapter(kysely, {
				type: databaseType ?? undefined,
				transaction,
			})(options);
			const committedUser: User = {
				id: "committed-user",
				name: "Committed User",
				email: "committed@example.com",
				emailVerified: true,
				image: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			await adapter.transaction(async (transactionAdapter) => {
				await transactionAdapter.create<User>({
					model: "user",
					data: committedUser,
					forceAllowId: true,
				});
			});
			await expect(
				adapter.findOne<User>({
					model: "user",
					where: [{ field: "id", value: committedUser.id }],
				}),
			).resolves.toMatchObject({ id: committedUser.id });

			await expect(
				adapter.transaction(async (transactionAdapter) => {
					const rolledBackUser: User = {
						...committedUser,
						id: "rolled-back-user",
						email: "rolled-back@example.com",
					};
					await transactionAdapter.create<User>({
						model: "user",
						data: rolledBackUser,
						forceAllowId: true,
					});
					throw new Error("rollback");
				}),
			).rejects.toThrow("rollback");
			await expect(
				adapter.findOne<User>({
					model: "user",
					where: [{ field: "id", value: "rolled-back-user" }],
				}),
			).resolves.toBeNull();
		} finally {
			database.close();
		}
	});

	it("enables transactions for explicit Kysely databases unless they are disabled", async () => {
		const database = new DatabaseSync(":memory:");
		try {
			const dialect = new NodeSqliteDialect({ database });
			const kysely = new Kysely({ dialect });
			await expect(
				createKyselyAdapter({
					database: { dialect, type: "sqlite" },
				}),
			).resolves.toMatchObject({ transaction: true });
			await expect(
				createKyselyAdapter({
					database: { dialect, type: "sqlite", transaction: false },
				}),
			).resolves.toMatchObject({ transaction: false });
			await expect(
				createKyselyAdapter({
					database: { db: kysely, type: "sqlite" },
				}),
			).resolves.toMatchObject({ transaction: true });
			await expect(
				createKyselyAdapter({
					database: { db: kysely, type: "sqlite", transaction: false },
				}),
			).resolves.toMatchObject({ transaction: false });
		} finally {
			database.close();
		}
	});

	it("uses an explicit D1 binding for community Kysely databases", async () => {
		const database = new DatabaseSync(":memory:");
		try {
			const dialect = new NodeSqliteDialect({ database });
			const explicitDatabase = new Kysely({ dialect });
			const d1Database = {
				prepare: vi.fn(),
				batch: vi.fn(),
				exec: vi.fn(),
			} as unknown as D1Database;
			const directAdapter = kyselyAdapter(explicitDatabase, {
				type: "sqlite",
				d1Database,
			})({ database: d1Database });
			expect(directAdapter.options?.adapterConfig.transaction).toBe(false);
			expect(directAdapter.commitAtomicWrites).toBeTypeOf("function");

			const fromDatabase = await createKyselyAdapter({
				database: {
					db: explicitDatabase,
					type: "sqlite",
					d1Database,
					transaction: true,
				},
			});
			expect(fromDatabase.transaction).toBe(false);
			if (!fromDatabase.kysely) throw new Error("Expected a Kysely database");
			expect(
				kyselyAdapter(fromDatabase.kysely, {
					type: "sqlite",
					transaction: fromDatabase.transaction,
				})({ database: d1Database }).commitAtomicWrites,
			).toBeTypeOf("function");

			const fromDialect = await createKyselyAdapter({
				database: {
					dialect,
					type: "sqlite",
					d1Database,
				},
			});
			expect(fromDialect.transaction).toBe(false);
			if (!fromDialect.kysely) throw new Error("Expected a Kysely database");
			expect(
				kyselyAdapter(fromDialect.kysely, {
					type: "sqlite",
					transaction: fromDialect.transaction,
				})({ database: d1Database }).commitAtomicWrites,
			).toBeTypeOf("function");
		} finally {
			database.close();
		}
	});

	it("uses raw D1 batches for atomic writes without claiming interactive transactions", async () => {
		const now = new Date();
		const logicalUser: User = {
			id: "d1-user",
			name: "D1 User",
			email: "d1@example.com",
			emailVerified: false,
			image: null,
			createdAt: now,
			updatedAt: now,
		};
		const storedUser = {
			...logicalUser,
			emailVerified: 0,
			createdAt: now.toISOString(),
			updatedAt: now.toISOString(),
		};
		const storedUpdatedUser = { ...storedUser, name: "Updated D1 User" };
		const logicalUpdatedUser = { ...logicalUser, name: "Updated D1 User" };
		const preparedQueries = new WeakMap<
			object,
			{ sql: string; parameters: unknown[] }
		>();
		const createStatement = (
			sql: string,
			parameters: unknown[] = [],
		): object => {
			const statement = {
				bind: (...boundParameters: unknown[]) =>
					createStatement(sql, boundParameters),
			};
			preparedQueries.set(statement, { sql, parameters });
			return statement;
		};
		const batch = vi.fn(async (statements: object[]) => {
			const prepared = statements.map((statement) =>
				preparedQueries.get(statement),
			);
			expect(prepared).toHaveLength(4);
			expect(prepared[0]?.sql).toMatch(/insert into "user"/i);
			expect(prepared[0]?.sql).toMatch(/returning/i);
			expect(prepared[1]?.sql).toMatch(/update "user"/i);
			expect(prepared[1]?.sql).toMatch(/returning/i);
			expect(prepared[2]?.sql).toMatch(/delete from "user"/i);
			expect(prepared[3]?.sql).toMatch(/delete from "user"/i);
			return [
				{
					success: true,
					meta: { changes: 1 },
					results: [storedUser],
				},
				{
					success: true,
					meta: { changes: 1 },
					results: [storedUpdatedUser],
				},
				{
					success: true,
					meta: { changes: 1 },
					results: [],
				},
				{
					success: true,
					meta: { changes: 2 },
					results: [],
				},
			];
		});
		const d1Database = {
			prepare: vi.fn((sql: string) => createStatement(sql)),
			batch,
			exec: vi.fn(),
		} as unknown as D1Database;
		const options = { database: d1Database } satisfies BetterAuthOptions;
		const initialized = await createKyselyAdapter(options);

		expect(initialized).toMatchObject({
			transaction: false,
		});
		if (!initialized.kysely) throw new Error("Expected a Kysely database");
		const adapterConfig = {
			type: initialized.databaseType ?? undefined,
			transaction: initialized.transaction,
		};
		const adapter = kyselyAdapter(initialized.kysely, adapterConfig)(options);

		expect(adapter.commitAtomicWrites).toBeTypeOf("function");
		await expect(
			adapter.commitAtomicWrites?.([
				{
					type: "create",
					model: "user",
					forceAllowId: true,
					data: logicalUser,
				},
				{
					type: "update",
					model: "user",
					where: [{ field: "id", value: logicalUser.id }],
					update: { name: logicalUpdatedUser.name },
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
			{ type: "create", record: logicalUser },
			{ type: "update", record: logicalUpdatedUser },
			{ type: "delete", deletedCount: 1 },
			{ type: "deleteMany", deletedCount: 2 },
		]);
		expect(batch).toHaveBeenCalledTimes(1);
		expect(adapter.options?.adapterConfig.transaction).toBe(false);
	});

	it("consumeOne deletes only the selected row for non-unique predicates", async () => {
		const selectQuery = {
			select: vi.fn(() => selectQuery),
			where: vi.fn(() => selectQuery),
			limit: vi.fn(() => selectQuery),
		};
		const deleted = {
			id: "verification-1",
			identifier: "same-identifier",
			value: "first",
		};
		const deleteQuery = {
			where: vi.fn(() => deleteQuery),
			returningAll: vi.fn(() => deleteQuery),
			executeTakeFirst: vi.fn().mockResolvedValue(deleted),
		};
		const db = {
			selectFrom: vi.fn(() => selectQuery),
			deleteFrom: vi.fn(() => deleteQuery),
		} as any;
		const adapter = kyselyAdapter(db)({});

		const result = await adapter.consumeOne({
			model: "verification",
			where: [{ field: "identifier", value: "same-identifier" }],
		});

		expect(result).toEqual(deleted);
		expect(selectQuery.select).toHaveBeenCalledWith("verification.id");
		expect(selectQuery.where).toHaveBeenCalledTimes(1);
		expect(deleteQuery.where).toHaveBeenCalledTimes(1);
		expect(deleteQuery.where).toHaveBeenCalledWith(
			"verification.id",
			"in",
			selectQuery,
		);
		expect(deleteQuery.returningAll).toHaveBeenCalledTimes(1);
	});

	it("consumeOne uses a top(1) subquery and OUTPUT on mssql", async () => {
		// SQL Server rejects `LIMIT`; the single-row subquery must compile to
		// `select top(1) ...` and the delete must return the row via `OUTPUT`.
		const selectQuery = {
			select: vi.fn(() => selectQuery),
			where: vi.fn(() => selectQuery),
			top: vi.fn(() => selectQuery),
			limit: vi.fn(() => selectQuery),
		};
		const deleted = {
			id: "verification-1",
			identifier: "same-identifier",
			value: "first",
		};
		const deleteQuery = {
			where: vi.fn(() => deleteQuery),
			outputAll: vi.fn(() => deleteQuery),
			executeTakeFirst: vi.fn().mockResolvedValue(deleted),
		};
		const db = {
			selectFrom: vi.fn(() => selectQuery),
			deleteFrom: vi.fn(() => deleteQuery),
		} as any;
		const adapter = kyselyAdapter(db, { type: "mssql" })({});

		const result = await adapter.consumeOne({
			model: "verification",
			where: [{ field: "identifier", value: "same-identifier" }],
		});

		expect(result).toEqual(deleted);
		expect(selectQuery.top).toHaveBeenCalledTimes(1);
		expect(selectQuery.top).toHaveBeenCalledWith(1);
		expect(selectQuery.limit).not.toHaveBeenCalled();
		expect(deleteQuery.where).toHaveBeenCalledWith(
			"verification.id",
			"in",
			selectQuery,
		);
		expect(deleteQuery.outputAll).toHaveBeenCalledWith("deleted");
	});
});
