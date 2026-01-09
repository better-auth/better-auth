import { expect, test } from "@playwright/test";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db";
import { nextCookies } from "better-auth/next-js";
import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from "postgres";

test.describe("postgres-js", async () => {
	test("run migration", async () => {
		const sql = postgres(
			process.env.DATABASE_URL ||
				"postgres://user:password@localhost:5432/better_auth",
		);
		const dialect = new PostgresJSDialect({
			postgres: sql,
		});
		const auth = betterAuth({
			database: {
				dialect,
				type: "postgres",
				transaction: false,
			},
			emailAndPassword: {
				enabled: true,
			},
			plugins: [nextCookies()],
			baseURL: "http://localhost:3000",
		});

		const { runMigrations } = await getMigrations(auth.options);
		await runMigrations();
		const allTables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema='public'
      AND table_type='BASE TABLE';
    `;
		const tableNames = allTables.map((row) => row.table_name);
		expect(tableNames).toEqual(["user", "session", "account", "verification"]);
	});
});
