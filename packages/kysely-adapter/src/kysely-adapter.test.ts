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

	it("createMany restores input order from mssql OUTPUT", async () => {
		const insertQuery = {
			values: vi.fn(() => insertQuery),
			outputAll: vi.fn(() => insertQuery),
			execute: vi.fn().mockResolvedValue([
				{ id: "b", name: "Bob" },
				{ id: "a", name: "Ada" },
			]),
		};
		const db = {
			insertInto: vi.fn(() => insertQuery),
		} as any;
		const adapter = kyselyAdapter(db, { type: "mssql" })({});

		const created = await adapter.createMany({
			model: "user",
			data: [
				{
					id: "a",
					name: "Ada",
					email: "ada@example.com",
					emailVerified: false,
				},
				{
					id: "b",
					name: "Bob",
					email: "bob@example.com",
					emailVerified: false,
				},
			],
			forceAllowId: true,
		});

		expect(insertQuery.outputAll).toHaveBeenCalledWith("inserted");
		expect(created.map((row) => row.id)).toEqual(["a", "b"]);
	});

	it("raises createManyMaxParameters for postgres and keeps sqlite at the default", () => {
		const db = {
			selectFrom: vi.fn(),
		} as any;
		const sqlite = kyselyAdapter(db, { type: "sqlite" })({});
		const postgres = kyselyAdapter(db, { type: "postgres" })({});
		const mssql = kyselyAdapter(db, { type: "mssql" })({});
		const d1 = kyselyAdapter(db, {
			type: "sqlite",
			createManyMaxParameters: 100,
		})({});

		expect(sqlite.options?.adapterConfig.createManyMaxParameters).toBe(999);
		expect(postgres.options?.adapterConfig.createManyMaxParameters).toBe(65535);
		expect(mssql.options?.adapterConfig.createManyMaxParameters).toBe(2099);
		expect(mssql.options?.adapterConfig.createManyMaxRows).toBe(1000);
		expect(d1.options?.adapterConfig.createManyMaxParameters).toBe(100);
		expect(sqlite.options?.adapterConfig.createManyMaxRows).toBeUndefined();
	});

	const createManyRows = [
		{
			id: "a",
			name: "Ada",
			email: "ada@example.com",
			emailVerified: false,
		},
		{
			id: "b",
			name: "Bob",
			email: "bob@example.com",
			emailVerified: false,
		},
	];

	it("createMany restores input order from sqlite RETURNING", async () => {
		const insertQuery = {
			values: vi.fn(() => insertQuery),
			returningAll: vi.fn(() => insertQuery),
			execute: vi.fn().mockResolvedValue([
				{ id: "b", name: "Bob" },
				{ id: "a", name: "Ada" },
			]),
		};
		const db = {
			insertInto: vi.fn(() => insertQuery),
		} as any;
		const adapter = kyselyAdapter(db, { type: "sqlite" })({});

		const created = await adapter.createMany({
			model: "user",
			data: createManyRows,
			forceAllowId: true,
		});

		expect(insertQuery.returningAll).toHaveBeenCalledTimes(1);
		expect(created.map((row) => row.id)).toEqual(["a", "b"]);
	});

	it("createMany does not use bulk RETURNING or OUTPUT when ids are generated", async () => {
		const insertQuery = {
			values: vi.fn(() => insertQuery),
			returningAll: vi.fn(() => insertQuery),
			outputAll: vi.fn(() => insertQuery),
			execute: vi.fn(),
			executeTakeFirst: vi.fn().mockResolvedValue({ id: "generated" }),
		};
		const db = {
			insertInto: vi.fn(() => insertQuery),
		} as any;
		const adapter = kyselyAdapter(db, { type: "sqlite" })({
			advanced: { database: { generateId: false } },
		});

		await adapter.createMany({
			model: "user",
			data: [
				{ name: "Ada", email: "ada@example.com", emailVerified: false },
				{ name: "Bob", email: "bob@example.com", emailVerified: false },
			],
		});

		expect(insertQuery.values).toHaveBeenCalledTimes(2);
		expect(insertQuery.execute).not.toHaveBeenCalled();
		expect(insertQuery.executeTakeFirst).toHaveBeenCalledTimes(2);
	});

	it("inserts sqlite rows sequentially when optional fields differ", async () => {
		const insertQuery = {
			values: vi.fn(() => insertQuery),
			returningAll: vi.fn(() => insertQuery),
			execute: vi.fn(),
			executeTakeFirst: vi.fn().mockResolvedValue({ id: "generated" }),
		};
		const db = {
			insertInto: vi.fn(() => insertQuery),
		} as any;
		const adapter = kyselyAdapter(db, { type: "sqlite" })({});

		await adapter.createMany({
			model: "user",
			data: [
				{
					id: "a",
					name: "Ada",
					email: "ada@example.com",
					emailVerified: false,
					image: "https://example.com/ada.png",
				},
				{
					id: "b",
					name: "Bob",
					email: "bob@example.com",
					emailVerified: false,
				},
			],
			forceAllowId: true,
		});

		expect(insertQuery.values).toHaveBeenCalledTimes(2);
		expect(insertQuery.returningAll).toHaveBeenCalledTimes(2);
		expect(insertQuery.execute).not.toHaveBeenCalled();
		expect(insertQuery.executeTakeFirst).toHaveBeenCalledTimes(2);
	});

	it("createMany reads MySQL rows back in the same transaction as the insert", async () => {
		const readError = new Error("read failed");
		const insertQuery = {
			values: vi.fn(() => insertQuery),
			execute: vi.fn().mockResolvedValue(undefined),
		};
		const selectQuery = {
			selectAll: vi.fn(() => selectQuery),
			where: vi.fn(() => selectQuery),
			execute: vi.fn().mockRejectedValue(readError),
		};
		const trx = {
			insertInto: vi.fn(() => insertQuery),
			selectFrom: vi.fn(() => selectQuery),
		};
		const db = {
			insertInto: vi.fn(),
			selectFrom: vi.fn(),
			transaction: vi.fn(() => ({
				execute: (cb: (transaction: typeof trx) => Promise<unknown>) => cb(trx),
			})),
		} as any;
		const adapter = kyselyAdapter(db, { type: "mysql" })({});

		await expect(
			adapter.createMany({
				model: "user",
				data: createManyRows,
				forceAllowId: true,
			}),
		).rejects.toBe(readError);
		expect(db.transaction).toHaveBeenCalledTimes(1);
		expect(trx.insertInto).toHaveBeenCalledTimes(1);
		expect(trx.selectFrom).toHaveBeenCalledTimes(1);
		expect(db.insertInto).not.toHaveBeenCalled();
		expect(db.selectFrom).not.toHaveBeenCalled();
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
