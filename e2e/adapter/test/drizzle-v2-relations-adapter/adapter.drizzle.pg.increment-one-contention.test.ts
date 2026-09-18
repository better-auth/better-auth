/**
 * @see https://github.com/better-auth/better-auth/issues/10557
 *
 * `incrementOne` is the adapter's compare-and-swap primitive: the `where`
 * clause is the guard, and callers rely on at most one concurrent call
 * winning it. The rate limiter increments `count` guarded by `count < max`,
 * the organization plugin flips an invitation guarded by `status = pending`,
 * and two-factor consumes a backup code guarded by the old code list.
 *
 * The adapter selected one id under the guard in a subquery and updated by
 * that id alone. Under READ COMMITTED, PostgreSQL re-checks an UPDATE's own
 * WHERE against the new row version after waiting on a concurrent writer,
 * but not an uncorrelated subquery's, so every waiting call succeeded once
 * the first one committed: a limit of 5 let 8 of 20 through, and two callers
 * both "claimed" one invitation. The guard now lives on the UPDATE as well.
 *
 * `relations-v2` carries its own copy of `incrementOne`; this is the same test
 * as the one in ../drizzle-adapter, against that entry point and drizzle 1.0.
 */
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { drizzle } from "drizzle-orm/node-postgres";
import { integer, pgSchema, text } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// A schema of its own: the sibling suite in this directory runs
// `DROP SCHEMA public CASCADE` while files run in parallel.
const schema = pgSchema("increment_one_contention_v2");
const counters = schema.table("counters", {
	id: text("id").primaryKey(),
	used: integer("used").notNull(),
	status: text("status").notNull(),
});

// Every call must be in flight at once for the statements to contend on the
// row rather than queue in the pool; with a pool of 1 the unguarded adapter
// passes this test too.
const CONCURRENT_CALLS = 20;
const MAX = 5;

describe("drizzle adapter relations-v2 (pg): incrementOne under contention", () => {
	const pool = new Pool({
		connectionString: "postgres://user:password@localhost:5432/better_auth",
		max: CONCURRENT_CALLS,
	});
	const adapter = drizzleAdapter(drizzle({ client: pool }), {
		provider: "pg",
		schema: { counters },
	})({
		plugins: [
			{
				id: "counters-test",
				schema: {
					counters: {
						fields: {
							used: { type: "number" },
							status: { type: "string" },
						},
					},
				},
			},
		],
	});

	const seed = (ids: string[]) =>
		pool.query(
			`INSERT INTO "increment_one_contention_v2"."counters" ("id", "used", "status")
			 VALUES ${ids.map((_, i) => `($${i + 1}, 0, 'pending')`).join(", ")}`,
			ids,
		);

	const rows = async () =>
		(
			await pool.query<{ id: string; used: number; status: string }>(
				`SELECT "id", "used", "status" FROM "increment_one_contention_v2"."counters" ORDER BY "id"`,
			)
		).rows;

	const bump = (id: string) =>
		adapter.incrementOne<{ used: number }>({
			model: "counters",
			where: [
				{ field: "id", value: id },
				{ field: "used", operator: "lt", value: MAX },
			],
			increment: { used: 1 },
		});

	beforeAll(async () => {
		expect(pool.options.max).toBe(CONCURRENT_CALLS);
		await pool.query(`
			CREATE SCHEMA IF NOT EXISTS "increment_one_contention_v2";
			DROP TABLE IF EXISTS "increment_one_contention_v2"."counters";
			CREATE TABLE "increment_one_contention_v2"."counters" (
				"id" text PRIMARY KEY,
				"used" integer NOT NULL,
				"status" text NOT NULL
			);
		`);
	});

	beforeEach(async () => {
		// Seeded directly: the adapter factory assigns its own ids on `create`,
		// and the guards below address rows by these.
		await pool.query(`DELETE FROM "increment_one_contention_v2"."counters"`);
	});

	afterAll(async () => {
		await pool.query(
			`DROP SCHEMA IF EXISTS "increment_one_contention_v2" CASCADE`,
		);
		await pool.end();
	});

	it("lets a bounded counter be incremented exactly `max` times", async () => {
		await seed(["shared"]);

		const results = await Promise.all(
			Array.from({ length: CONCURRENT_CALLS }, () => bump("shared")),
		);

		expect(results.filter((result) => result !== null)).toHaveLength(MAX);
		expect(await rows()).toEqual([
			{ id: "shared", used: MAX, status: "pending" },
		]);
	});

	it("mutates one row per win when the guard matches several rows", async () => {
		// A guard with no id in it matches every row that is still under the
		// limit. The `LIMIT 1` subquery pins each call to one row: every win must
		// move exactly one row, and no row may pass the limit.
		await seed(["a", "b", "c"]);

		const results = await Promise.all(
			Array.from({ length: CONCURRENT_CALLS }, () =>
				adapter.incrementOne<{ used: number }>({
					model: "counters",
					where: [{ field: "used", operator: "lt", value: MAX }],
					increment: { used: 1 },
				}),
			),
		);
		const after = await rows();

		const wins = results.filter((result) => result !== null).length;
		expect(after.reduce((sum, row) => sum + row.used, 0)).toBe(wins);
		for (const row of after) expect(row.used).toBeLessThanOrEqual(MAX);
	});

	it("lets exactly one caller win a status transition", async () => {
		await seed(["shared"]);

		const results = await Promise.all(
			Array.from({ length: CONCURRENT_CALLS }, () =>
				adapter.incrementOne<{ status: string }>({
					model: "counters",
					where: [
						{ field: "id", value: "shared" },
						{ field: "status", value: "pending" },
					],
					increment: {},
					set: { status: "accepted" },
				}),
			),
		);

		expect(results.filter((result) => result !== null)).toHaveLength(1);
		expect(await rows()).toEqual([
			{ id: "shared", used: 0, status: "accepted" },
		]);
	});
});
