import { kyselyAdapter } from "@better-auth/kysely-adapter";
import { Kysely, PostgresDialect } from "kysely";
import type { PoolClient } from "pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const pool = new Pool({
	connectionString:
		process.env.BETTER_AUTH_ADAPTER_TEST_DATABASE_URL ??
		"postgres://user:password@localhost:5433/better_auth",
	max: 4,
});
// Report dropped idle connections without an unhandled pool error.
pool.on("error", (error) => {
	console.error("idle client error", error);
});
type GuardedRow = { id: string; authority: string | null; attempts: number };

function createAdapter(client: PoolClient) {
	// Borrow the statement's pinned connection; the fixture owns its release.
	const db = new Kysely<Record<string, unknown>>({
		dialect: new PostgresDialect({
			pool: {
				connect: async () => ({
					query: client.query.bind(client),
					release: () => {},
				}),
				end: async () => {},
			},
		}),
	}).withSchema("kysely_guard_contract");
	return kyselyAdapter(db, { type: "postgres" })({
		secret: "guarded-write-contract-test-secret",
		user: {
			additionalFields: {
				authority: { type: "string", required: false },
				attempts: { type: "number", required: false },
			},
		},
	});
}

async function waitForRowLock(pid: number) {
	const deadline = Date.now() + 5000;
	while (Date.now() < deadline) {
		const { rows } = await pool.query<{ blocked: boolean }>(
			"SELECT wait_event_type = 'Lock' AS blocked FROM pg_stat_activity WHERE pid = $1",
			[pid],
		);
		if (rows[0]?.blocked) return;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error("The guarded operation did not reach the held row lock");
}

async function whileGuardChanges(
	operation: (
		adapter: ReturnType<typeof createAdapter>,
	) => Promise<GuardedRow | null>,
) {
	const blocker = await pool.connect();
	const updater = await pool.connect();
	let pending: Promise<GuardedRow | null> | undefined;
	try {
		await blocker.query("BEGIN");
		await blocker.query(
			`UPDATE kysely_guard_contract."user" SET authority = 'new', attempts = 0 WHERE id = 'user-1'`,
		);
		const { rows } = await updater.query<{ pid: number }>(
			"SELECT pg_backend_pid() AS pid",
		);
		pending = operation(createAdapter(updater));
		// The old guard is visible in the statement snapshot while this row is
		// locked. Commit only after the competing statement is known to wait.
		await waitForRowLock(rows[0]!.pid);
		await blocker.query("COMMIT");
		return await pending;
	} finally {
		await blocker.query("ROLLBACK");
		await pending?.catch(() => {});
		blocker.release();
		updater.release();
	}
}

beforeAll(async () => {
	await pool.query(`
		CREATE SCHEMA IF NOT EXISTS kysely_guard_contract;
		DROP TABLE IF EXISTS kysely_guard_contract."user";
		CREATE TABLE kysely_guard_contract."user" (
			id text PRIMARY KEY, name text NOT NULL, email text NOT NULL,
			"emailVerified" boolean NOT NULL, image text,
			"createdAt" timestamp NOT NULL, "updatedAt" timestamp NOT NULL,
			authority text, attempts integer NOT NULL
		);
	`);
});

beforeEach(async () => {
	await pool.query(`TRUNCATE kysely_guard_contract."user"`);
	await pool.query(`
		INSERT INTO kysely_guard_contract."user"
			(id, name, email, "emailVerified", "createdAt", "updatedAt", authority, attempts)
		VALUES ('user-1', 'Test', 'test@example.com', false, now(), now(), 'old', 1);
	`);
});

afterAll(async () => {
	await pool.query("DROP SCHEMA kysely_guard_contract CASCADE");
	await pool.end();
});

/**
 * @see https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED
 */
describe("Kysely PostgreSQL guarded writes", () => {
	it("rejects a set-only mutation whose guard changed while waiting", async () => {
		const result = await whileGuardChanges((adapter) =>
			adapter.incrementOne<GuardedRow>({
				model: "user",
				where: [
					{ field: "id", value: "user-1" },
					{ field: "authority", value: "old" },
				],
				increment: {},
				set: { authority: "stale" },
			}),
		);
		expect(result).toBeNull();
		const { rows } = await pool.query<GuardedRow>(
			`SELECT id, authority, attempts FROM kysely_guard_contract."user"`,
		);
		expect(rows).toEqual([{ id: "user-1", authority: "new", attempts: 0 }]);
	});

	it("does not decrement a counter whose guard became false", async () => {
		const result = await whileGuardChanges((adapter) =>
			adapter.incrementOne<GuardedRow>({
				model: "user",
				where: [{ field: "attempts", value: 0, operator: "gt" }],
				increment: { attempts: -1 },
			}),
		);
		expect(result).toBeNull();
		const { rows } = await pool.query<GuardedRow>(
			`SELECT id, authority, attempts FROM kysely_guard_contract."user"`,
		);
		expect(rows[0]?.attempts).toBe(0);
	});

	it("does not consume a row whose guard changed while waiting", async () => {
		const result = await whileGuardChanges((adapter) =>
			adapter.consumeOne<GuardedRow>({
				model: "user",
				where: [
					{ field: "id", value: "user-1" },
					{ field: "authority", value: "old" },
				],
			}),
		);
		expect(result).toBeNull();
		const { rows } = await pool.query<GuardedRow>(
			`SELECT id, authority, attempts FROM kysely_guard_contract."user"`,
		);
		expect(rows).toEqual([{ id: "user-1", authority: "new", attempts: 0 }]);
	});

	it("mutates only one row and preserves ordinary successful guards", async () => {
		await pool.query(`
			INSERT INTO kysely_guard_contract."user"
				(id, name, email, "emailVerified", "createdAt", "updatedAt", authority, attempts)
			VALUES ('user-2', 'Other', 'other@example.com', false, now(), now(), 'old', 1);
		`);
		const client = await pool.connect();
		try {
			const adapter = createAdapter(client);
			const result = await adapter.incrementOne<GuardedRow>({
				model: "user",
				where: [{ field: "authority", value: "old" }],
				increment: { attempts: -1 },
				set: { authority: "new" },
			});
			expect(result).toMatchObject({ authority: "new", attempts: 0 });
			const { rows } = await pool.query<{ count: number }>(
				`SELECT count(*)::integer AS count FROM kysely_guard_contract."user" WHERE authority = 'new'`,
			);
			expect(rows[0]?.count).toBe(1);
			const consumed = await adapter.consumeOne<GuardedRow>({
				model: "user",
				where: [{ field: "authority", value: "old" }],
			});
			expect(consumed).toMatchObject({ authority: "old", attempts: 1 });
		} finally {
			client.release();
		}
	});
});
