import { PGlite } from "@electric-sql/pglite";
import { defineRelations } from "drizzle-orm-v1";
import { pgTable, text, timestamp } from "drizzle-orm-v1/pg-core";
import { drizzle } from "drizzle-orm-v1/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { drizzleAdapter } from "./drizzle-adapter";

/**
 * Integration coverage for `experimental.joins` on drizzle-orm 1.x.
 *
 * drizzle 1.x changed the relational (`db.query`) `where` from a raw `SQL` (0.x)
 * to an object filter DSL, so the clause the adapter builds throws
 * `Unknown relational filter field: "decoder"` and every join-enabled read
 * (e.g. `getSession`) 500s. The adapter now routes 1.x through the `RAW` escape
 * hatch, remapping columns onto the aliased root table.
 *
 * This runs against a real in-memory Postgres (pglite) and real drizzle 1.x
 * (installed as `drizzle-orm-v1`, aliased to `drizzle-orm` for this project — see
 * vitest.v1.config.ts). Without the fix, every query here throws the error above.
 */
const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull(),
	emailVerified: text("email_verified"),
	image: text("image"),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
});
const session = pgTable("session", {
	id: text("id").primaryKey(),
	token: text("token").notNull(),
	userId: text("user_id").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
});

const schema = { user, session };
const relations = defineRelations(schema, (r) => ({
	session: { user: r.one.user({ from: r.session.userId, to: r.user.id }) },
	user: { sessions: r.many.session() },
}));

const secret = "test-secret-that-is-at-least-32-chars-long!!";
let db: ReturnType<typeof drizzle>;

function createAdapter() {
	return drizzleAdapter(db as never, { provider: "pg", schema })({
		secret,
		experimental: { joins: true },
	});
}

describe("drizzle 1.x relational joins (pglite)", () => {
	beforeAll(async () => {
		const client = new PGlite();
		db = drizzle({ client, relations });
		await client.exec(`
			CREATE TABLE "user" (id text primary key, name text not null, email text not null, email_verified text, image text, created_at timestamp not null, updated_at timestamp not null);
			CREATE TABLE "session" (id text primary key, token text not null, user_id text not null, expires_at timestamp not null, created_at timestamp not null, updated_at timestamp not null);
			INSERT INTO "user" values ('u1','Alice','alice@example.com', null, null, now(), now());
			INSERT INTO "session" values ('s1','tok_abc','u1', now(), now(), now());
		`);
	});

	it("findOne resolves the relational where instead of throwing 'decoder'", async () => {
		const adapter = createAdapter();

		const found = await adapter.findOne<{ id: string; email: string }>({
			model: "user",
			where: [{ field: "email", value: "alice@example.com" }],
		});

		expect(found?.id).toBe("u1");
		expect(found?.email).toBe("alice@example.com");
	});

	it("findMany resolves the relational where", async () => {
		const adapter = createAdapter();

		const rows = await adapter.findMany<{ id: string }>({
			model: "session",
			where: [{ field: "token", value: "tok_abc" }],
		});

		expect(rows).toHaveLength(1);
		expect(rows[0]?.id).toBe("s1");
	});
});
