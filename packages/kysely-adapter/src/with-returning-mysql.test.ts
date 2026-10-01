import { DatabaseSync } from "node:sqlite";
import type { BetterAuthOptions } from "@better-auth/core";
import { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { kyselyAdapter } from "./kysely-adapter";
import { NodeSqliteDialect } from "./node-sqlite-dialect";

interface TokensTable {
	id: string;
	revoked: string | null;
	clientId: string;
}

interface TestDatabase {
	tokens: TokensTable;
}

// Register `tokens` as a known model through a plugin schema so the factory
// recognizes the table and maps field names. The Kysely backing store is
// SQLite, but the adapter is configured with `type: "mysql"` so the
// `withReturning` MySQL branch executes against a real database without
// requiring a MySQL container for the regression.
const options: BetterAuthOptions = {
	plugins: [
		{
			id: "tokens-test",
			schema: {
				tokens: {
					fields: {
						revoked: { type: "string" },
						clientId: { type: "string" },
					},
				},
			},
		},
	],
};

let sqlite: DatabaseSync;
let db: Kysely<TestDatabase>;

function buildAdapter() {
	return kyselyAdapter(db as unknown as Kysely<any>, { type: "mysql" })(
		options,
	);
}

beforeEach(() => {
	sqlite = new DatabaseSync(":memory:");
	sqlite
		.prepare(
			"CREATE TABLE tokens (id TEXT PRIMARY KEY, revoked TEXT, clientId TEXT)",
		)
		.run();
	db = new Kysely<TestDatabase>({
		dialect: new NodeSqliteDialect({ database: sqlite }),
	});
});

afterEach(async () => {
	await db.destroy();
});

describe("kysely withReturning mysql update", () => {
	/**
	 * Predicate-drop CAS regression: the MySQL re-SELECT path used to
	 * match by `where[0].field` alone, returning the row even when the
	 * guarded UPDATE matched zero rows. Callers building compare-and-swap
	 * on top of `update` (e.g. `WHERE id = ? AND revoked IS NULL`) would
	 * silently fail open on MySQL only. The contract here matches what
	 * SQLite/Postgres/MSSQL's RETURNING paths produce: an unmatched UPDATE
	 * returns `null`.
	 */
	it("returns null when a multi-predicate UPDATE matches no row", async () => {
		await db
			.insertInto("tokens")
			.values({ id: "a", revoked: null, clientId: "c1" })
			.execute();

		const adapter = buildAdapter();

		const winner = await adapter.update<TokensTable>({
			model: "tokens",
			where: [
				{ field: "id", value: "a" },
				{ field: "revoked", operator: "eq", value: null },
			],
			update: { revoked: "2024-01-01T00:00:00.000Z" },
		});
		expect(winner).not.toBeNull();
		expect(winner!.id).toBe("a");
		expect(winner!.revoked).toBe("2024-01-01T00:00:00.000Z");

		// Second attempt with the same CAS guard: the row's `revoked` is no
		// longer null, so the UPDATE must match zero rows and the adapter
		// must surface that as `null`, not the post-first-rotation row.
		const loser = await adapter.update<TokensTable>({
			model: "tokens",
			where: [
				{ field: "id", value: "a" },
				{ field: "revoked", operator: "eq", value: null },
			],
			update: { revoked: "2099-01-01T00:00:00.000Z" },
		});
		expect(loser).toBeNull();

		const after = await db
			.selectFrom("tokens")
			.selectAll()
			.where("id", "=", "a")
			.executeTakeFirst();
		expect(after?.revoked).toBe("2024-01-01T00:00:00.000Z");
	});

	it("returns no row when the where matches nothing at all", async () => {
		await db
			.insertInto("tokens")
			.values({ id: "a", revoked: null, clientId: "c1" })
			.execute();

		const adapter = buildAdapter();

		const result = await adapter.update<TokensTable>({
			model: "tokens",
			where: [{ field: "id", value: "does-not-exist" }],
			update: { clientId: "c2" },
		});
		expect(result ?? null).toBeNull();

		const row = await db
			.selectFrom("tokens")
			.selectAll()
			.where("id", "=", "a")
			.executeTakeFirst();
		expect(row?.clientId).toBe("c1");
	});

	it("returns the updated row when a single-predicate UPDATE matches", async () => {
		await db
			.insertInto("tokens")
			.values({ id: "a", revoked: null, clientId: "c1" })
			.execute();

		const adapter = buildAdapter();

		const result = await adapter.update<TokensTable>({
			model: "tokens",
			where: [{ field: "id", value: "a" }],
			update: { clientId: "c2" },
		});
		expect(result).not.toBeNull();
		expect(result!.id).toBe("a");
		expect(result!.clientId).toBe("c2");
	});

	// The re-SELECT only sees one field at a time, so when the caller puts a
	// non-unique guard first (`revoked IS NULL`) and the unique id second,
	// returning the row keyed off the first predicate would be ambiguous
	// across multiple revoked-null rows. The adapter prefers a unique
	// `id` from anywhere in `where[]` (or from `values`) for the lookup so
	// the post-update row resolves unambiguously regardless of caller-side
	// predicate ordering.
	it("re-SELECTs by id when id is not the first where predicate", async () => {
		await db
			.insertInto("tokens")
			.values([
				{ id: "a", revoked: null, clientId: "c1" },
				{ id: "b", revoked: null, clientId: "c1" },
				{ id: "c", revoked: null, clientId: "c1" },
			])
			.execute();

		const adapter = buildAdapter();

		const result = await adapter.update<TokensTable>({
			model: "tokens",
			where: [
				{ field: "revoked", operator: "eq", value: null },
				{ field: "id", value: "b" },
			],
			update: { clientId: "c2" },
		});

		expect(result).not.toBeNull();
		expect(result!.id).toBe("b");
		expect(result!.clientId).toBe("c2");

		const others = await db
			.selectFrom("tokens")
			.selectAll()
			.where("id", "in", ["a", "c"])
			.execute();
		for (const row of others) {
			expect(row.clientId).toBe("c1");
		}
	});

	it("does not key the re-SELECT off a non-eq `id` predicate", async () => {
		await db
			.insertInto("tokens")
			.values([
				{ id: "a", revoked: null, clientId: "c1" },
				{ id: "b", revoked: null, clientId: "c2" },
			])
			.execute();

		const adapter = buildAdapter();

		const result = await adapter.update<TokensTable>({
			model: "tokens",
			where: [
				{ field: "clientId", operator: "eq", value: "c2" },
				{ field: "id", operator: "ne", value: "a" },
			],
			update: { revoked: "2024-01-01T00:00:00.000Z" },
		});

		expect(result).not.toBeNull();
		// The UPDATE matched row "b" (clientId = c2 AND id != a). The
		// re-SELECT must NOT key off `id = "a"` — that would return the row
		// the UPDATE intentionally skipped (row "a" with revoked still null).
		expect(result!.id).toBe("b");
		expect(result!.revoked).toBe("2024-01-01T00:00:00.000Z");

		const rowA = await db
			.selectFrom("tokens")
			.selectAll()
			.where("id", "=", "a")
			.executeTakeFirst();
		expect(rowA?.revoked).toBeNull();
	});

	// `update` is the single-row variant. An empty `where` would otherwise
	// compile to `UPDATE table SET ...` with no predicate and silently
	// mutate every row in the table; on MySQL it would also fall through
	// to the `withReturning` insert-fetch cascade. Use `updateMany` for
	// bulk operations instead.
	it("returns null and does not mutate any row when where is empty", async () => {
		await db
			.insertInto("tokens")
			.values([
				{ id: "a", revoked: null, clientId: "c1" },
				{ id: "b", revoked: null, clientId: "c1" },
			])
			.execute();

		const adapter = buildAdapter();

		const result = await adapter.update<TokensTable>({
			model: "tokens",
			where: [],
			update: { clientId: "c2" },
		});
		expect(result).toBeNull();

		const rows = await db
			.selectFrom("tokens")
			.selectAll()
			.orderBy("id")
			.execute();
		expect(rows).toHaveLength(2);
		for (const row of rows) {
			expect(row.clientId).toBe("c1");
		}
	});
});
