import type { SQLInputValue } from "node:sqlite";
import { DatabaseSync } from "node:sqlite";
import type { BetterAuthOptions } from "@better-auth/core";
import type { DatabaseConnection, Dialect, QueryResult } from "kysely";
import { CompiledQuery, Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { kyselyAdapter } from "./kysely-adapter";
import { NodeSqliteDialect } from "./node-sqlite-dialect";

/**
 * A pooled connection with MySQL's per-connection `LAST_INSERT_ID()`
 * semantics on top of a shared SQLite database. Every connection remembers
 * the auto-increment id of the last INSERT *it* ran, and answers
 * `SELECT LAST_INSERT_ID()` from that memory, exactly like a mysql2 pool
 * connection does.
 */
function createPooledConnection(
	db: DatabaseSync,
	tablesWithoutAutoIncrement: Set<string>,
) {
	return {
		lastInsertId: 0n,
		async executeQuery<O>(
			compiledQuery: CompiledQuery,
		): Promise<QueryResult<O>> {
			const { sql, parameters } = compiledQuery;
			if (/LAST_INSERT_ID\(\)/i.test(sql)) {
				return {
					rows: [{ id: Number(this.lastInsertId) } as O],
				};
			}
			const stmt = db.prepare(sql);
			stmt.setReadBigInts(true);
			const params = parameters as SQLInputValue[];
			if (stmt.columns().length > 0) {
				return { rows: stmt.all(...params) as O[] };
			}
			const { changes, lastInsertRowid } = stmt.run(...params);
			const insertMatch = /^\s*insert\s+into\s+"?(\w+)"?/i.exec(sql);
			if (!insertMatch) {
				return { rows: [], numAffectedRows: BigInt(changes) };
			}
			const table = insertMatch[1]!;
			const insertId = tablesWithoutAutoIncrement.has(table)
				? 0n
				: BigInt(lastInsertRowid);
			this.lastInsertId = insertId;
			return {
				rows: [],
				numAffectedRows: BigInt(changes),
				// Kysely's MysqlDriver maps a `0` insertId to `undefined`.
				insertId: insertId === 0n ? undefined : insertId,
			};
		},
		async *streamQuery(): AsyncIterableIterator<never> {
			throw new Error("not supported");
		},
	};
}

/**
 * A driver that hands out connections from a fixed pool in a scripted
 * order, standing in for the mysql2 pool giving a released connection to
 * the next waiter under concurrent load.
 */
function createScriptedPoolDriver(
	db: DatabaseSync,
	tablesWithoutAutoIncrement: Set<string>,
) {
	const connections = [
		createPooledConnection(db, tablesWithoutAutoIncrement),
		createPooledConnection(db, tablesWithoutAutoIncrement),
	] as const;
	const script: DatabaseConnection[] = [];
	return {
		connections,
		script,
		async init() {},
		async acquireConnection() {
			return this.script.shift() ?? connections[0];
		},
		async beginTransaction(connection: DatabaseConnection) {
			await connection.executeQuery(CompiledQuery.raw("begin"));
		},
		async commitTransaction(connection: DatabaseConnection) {
			await connection.executeQuery(CompiledQuery.raw("commit"));
		},
		async rollbackTransaction(connection: DatabaseConnection) {
			await connection.executeQuery(CompiledQuery.raw("rollback"));
		},
		async releaseConnection() {},
		async destroy() {},
	};
}

const options: BetterAuthOptions = {
	advanced: {
		database: {
			generateId: "serial",
		},
	},
	plugins: [
		{
			id: "insert-id-test",
			schema: {
				profile: {
					fields: {
						email: {
							type: "string",
							unique: true,
						},
						name: { type: "string" },
					},
				},
				ticket: {
					fields: {
						label: { type: "string" },
					},
				},
				legacy: {
					fields: {
						email: {
							type: "string",
							unique: true,
						},
					},
				},
			},
		},
	],
};

let sqlite: DatabaseSync;
let db: Kysely<unknown>;
let driver: ReturnType<typeof createScriptedPoolDriver>;

beforeEach(() => {
	sqlite = new DatabaseSync(":memory:");
	sqlite
		.prepare(
			"CREATE TABLE profile (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE, name TEXT)",
		)
		.run();
	sqlite
		.prepare(
			"CREATE TABLE ticket (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT)",
		)
		.run();
	// Stands in for a table whose `id` is not AUTO_INCREMENT.
	sqlite
		.prepare("CREATE TABLE legacy (id INTEGER PRIMARY KEY, email TEXT UNIQUE)")
		.run();
	driver = createScriptedPoolDriver(sqlite, new Set(["legacy"]));
	const base = new NodeSqliteDialect({ database: sqlite });
	const dialect: Dialect = {
		createDriver: () => driver,
		createQueryCompiler: () => base.createQueryCompiler(),
		createAdapter: () => base.createAdapter(),
		createIntrospector: (k) => base.createIntrospector(k),
	};
	db = new Kysely({ dialect });
});

afterEach(async () => {
	await db.destroy();
});

function buildAdapter(opts = options) {
	return kyselyAdapter(db, { type: "mysql" })(opts);
}

/**
 * Serial inserts must resolve their own row across pooled connections and
 * reject missing generated ids without falling back to field matching.
 *
 * @see https://dev.mysql.com/doc/refman/8.4/en/information-functions.html#function_last-insert-id
 */
describe("kysely withReturning mysql insert with serial ids", () => {
	it("returns the row this call inserted even when the follow-up query runs on another pooled connection", async () => {
		const [connA, connB] = driver.connections;
		const adapter = buildAdapter();

		// Keep a pre-existing row with the same id as the other connection's insert.
		sqlite
			.prepare("INSERT INTO profile (email, name) VALUES (?, ?)")
			.run("existing@example.com", "Existing");

		// Connection B's insert id overlaps the existing profile id.
		await connB.executeQuery(
			CompiledQuery.raw('INSERT INTO "ticket" ("label") VALUES (?)', [
				"unrelated",
			]),
		);
		expect(connB.lastInsertId).toBe(1n);

		// The insert and lookup use different pooled connections.
		driver.script = [connA, connB];
		const created = await adapter.create({
			model: "profile",
			data: {
				email: "new@example.com",
				name: "New",
			},
		});

		expect(created).toEqual({
			email: "new@example.com",
			name: "New",
			id: "2",
		});
	});

	it("does not report a failure when the stale connection value matches no row", async () => {
		const [connA, connB] = driver.connections;
		const adapter = buildAdapter();

		// B's last insert id (99) matches no profile row.
		connB.lastInsertId = 99n;

		driver.script = [connA, connB];
		const created = await adapter.create({
			model: "profile",
			data: {
				email: "first@example.com",
				name: "First",
			},
		});

		expect(created).toMatchObject({
			email: "first@example.com",
		});
	});

	/**
	 * @see https://kysely-org.github.io/kysely-apidoc/classes/InsertResult.html
	 */
	it.each([
		BigInt(Number.MAX_SAFE_INTEGER),
		BigInt(Number.MAX_SAFE_INTEGER) + 2n,
	])(
		"preserves the generated id %s when selecting the inserted row",
		async (insertId) => {
			const seed = sqlite.prepare(
				"INSERT INTO profile (id, email, name) VALUES (?, ?, ?)",
			);
			seed.setReadBigInts(true);
			seed.run(insertId - 1n, "existing@example.com", "Existing");

			const [connA, connB] = driver.connections;
			driver.script = [connA, connB];
			const created = await buildAdapter().create({
				model: "profile",
				data: {
					email: "new@example.com",
					name: "New",
				},
			});

			expect(created).toEqual({
				id: insertId.toString(),
				email: "new@example.com",
				name: "New",
			});
		},
	);

	it("fails closed instead of guessing when the INSERT reports no auto-increment id", async () => {
		const adapter = buildAdapter();

		// A missing generated id must surface as a configuration error.
		await expect(
			adapter.create({
				model: "legacy",
				data: {
					email: "no-auto-increment@example.com",
				},
			}),
		).rejects.toThrow(/did not report an auto-increment id/);
		// The rejected create must not leave its row behind.
		expect(sqlite.prepare("SELECT * FROM legacy").all()).toEqual([]);
	});

	it("still resolves rows by their unique columns when ids are not serial", async () => {
		const adapter = buildAdapter({
			...options,
			advanced: {
				database: {
					generateId: false,
				},
			},
		});

		const created = await adapter.create({
			model: "legacy",
			data: {
				email: "plain@example.com",
			},
		});
		expect(created).toMatchObject({
			email: "plain@example.com",
		});
	});
});
