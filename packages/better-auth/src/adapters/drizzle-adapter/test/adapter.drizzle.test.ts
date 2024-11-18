import { afterAll, beforeAll, describe } from "vitest";
import * as schema from "./schema";
import { runAdapterTest } from "../../test";
import { drizzleAdapter } from "..";
import { getMigrations } from "../../../db/get-migration";
import { drizzle } from "drizzle-orm/node-postgres";
import type { BetterAuthOptions } from "../../../types";
import { Pool } from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";

describe("adapter test", async () => {
	const pg = new Pool({
		connectionString: "postgres://user:password@localhost:5432/better_auth",
	});
	const opts = {
		database: pg,
		user: {
			fields: {
				email: "email_address",
			},
		},
		session: {
			modelName: "sessions",
		},
	} satisfies BetterAuthOptions;

	beforeAll(async () => {
		const { runMigrations } = await getMigrations(opts);
		await runMigrations();
	});

	const db = drizzle(pg);

	const postgres = new Kysely({
		dialect: new PostgresDialect({
			pool: pg,
		}),
	});

	afterAll(async () => {
		await sql`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`.execute(
			postgres,
		);
		await postgres.destroy();
	});

	const adapter = drizzleAdapter(db, {
		provider: "pg",
		schema,
	});

	await runAdapterTest({
		adapter: adapter(opts),
	});
});
