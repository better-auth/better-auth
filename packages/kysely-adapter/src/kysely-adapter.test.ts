import { DatabaseSync } from "node:sqlite";
import {
	DummyDriver,
	Kysely,
	PostgresAdapter,
	PostgresIntrospector,
	PostgresQueryCompiler,
	SqliteDialect,
} from "kysely";
import { describe, expect, it, vi } from "vitest";
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

	it("keeps model identity when a custom name matches another schema key", async ({
		onTestFinished,
	}) => {
		const sqlite = new DatabaseSync(":memory:");
		sqlite.exec(`
			CREATE TABLE account (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				email TEXT NOT NULL,
				emailVerified INTEGER NOT NULL,
				image TEXT,
				createdAt TEXT NOT NULL,
				updatedAt TEXT NOT NULL
			);
			CREATE TABLE session (
				id TEXT PRIMARY KEY,
				token TEXT NOT NULL,
				userId TEXT NOT NULL,
				expiresAt TEXT NOT NULL,
				ipAddress TEXT,
				userAgent TEXT,
				createdAt TEXT NOT NULL,
				updatedAt TEXT NOT NULL
			);
		`);
		const db = new Kysely<unknown>({
			dialect: new NodeSqliteDialect({ database: sqlite }),
		});
		onTestFinished(() => db.destroy());
		const adapter = kyselyAdapter(db, { type: "sqlite" })({
			user: { modelName: "account" },
			account: { modelName: "identity" },
			advanced: { database: { joins: true } },
		});
		const now = new Date();

		await adapter.create({
			model: "user",
			data: {
				id: "user-id",
				name: "Ada",
				email: "ada@example.com",
				emailVerified: false,
				createdAt: now,
				updatedAt: now,
			},
			forceAllowId: true,
		});
		await adapter.create({
			model: "session",
			data: {
				id: "session-id",
				token: "session-token",
				userId: "user-id",
				expiresAt: new Date(now.getTime() + 60_000),
				createdAt: now,
				updatedAt: now,
			},
			forceAllowId: true,
		});

		const session = await adapter.findOne<{ user: { email: string } }>({
			model: "session",
			where: [{ field: "id", value: "session-id" }],
			join: { user: true },
		});
		expect(session?.user.email).toBe("ada@example.com");
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
		expect(deleteQuery.where).toHaveBeenCalledTimes(2);
		expect(deleteQuery.where).toHaveBeenCalledWith(
			"verification.id",
			"in",
			selectQuery,
		);
		expect(deleteQuery.where).toHaveBeenNthCalledWith(2, expect.any(Function));
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
		expect(deleteQuery.where).toHaveBeenNthCalledWith(2, expect.any(Function));
		expect(deleteQuery.outputAll).toHaveBeenCalledWith("deleted");
	});

	/**
	 * @see https://node-postgres.com/features/types
	 */
	describe("JSON arrays on PostgreSQL", () => {
		const compiledParameters = () => {
			const parameters: unknown[][] = [];
			const db = new Kysely<unknown>({
				dialect: {
					createAdapter: () => new PostgresAdapter(),
					createDriver: () => new DummyDriver(),
					createIntrospector: (db) => new PostgresIntrospector(db),
					createQueryCompiler: () => new PostgresQueryCompiler(),
				},
				log: (event) => {
					parameters.push([...event.query.parameters]);
				},
			});
			const adapter = kyselyAdapter(db, { type: "postgres" })({
				plugins: [
					{
						id: "json-array-test",
						schema: {
							testModel: {
								fields: { json: { type: "json", required: false } },
							},
						},
					},
				],
			});
			return { adapter, parameters };
		};

		it("writes a top-level JSON array as JSON text", async () => {
			const { adapter, parameters } = compiledParameters();
			await adapter.updateMany({
				model: "testModel",
				where: [{ field: "id", value: "row-1" }],
				update: { json: [{ type: "payment" }] },
			});
			expect(parameters).toEqual([['[{"type":"payment"}]', "row-1"]]);
		});

		it("keeps each value of an in or not_in filter on a JSON field", async () => {
			const { adapter, parameters } = compiledParameters();
			await adapter.updateMany({
				model: "testModel",
				where: [
					{ field: "json", operator: "in", value: [1, 2] },
					{ field: "json", operator: "not_in", value: [3, 4] },
				],
				update: { json: { done: true } },
			});
			expect(parameters).toEqual([[{ done: true }, 1, 2, 3, 4]]);
		});
	});
});
