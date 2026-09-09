import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { drizzleAdapter } from "../../../../packages/drizzle-adapter/src/drizzle-adapter";

/** @see https://github.com/better-auth/better-auth/pull/8916 */
it.runIf(process.env.BETTER_AUTH_TEST_POSTGRES_URL)(
	"rechecks a pending email guard after waiting for a concurrent cancellation",
	async () => {
		const connectionString = process.env.BETTER_AUTH_TEST_POSTGRES_URL;
		if (!connectionString)
			throw new Error(
				"Set BETTER_AUTH_TEST_POSTGRES_URL to an isolated PostgreSQL test server",
			);
		const admin = new Pool({ connectionString });
		const database = `ba_cas_${randomUUID().replaceAll("-", "")}`;
		await admin.query(`CREATE DATABASE "${database}"`);
		const isolatedURL = new URL(connectionString);
		isolatedURL.pathname = database;
		const pool = new Pool({ connectionString: isolatedURL.toString() });
		try {
			await pool.query(
				'CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT, email TEXT, "emailVerified" BOOLEAN, image TEXT, "createdAt" TIMESTAMPTZ, "updatedAt" TIMESTAMPTZ, "pendingEmail" TEXT, "pendingEmailRequestId" TEXT)',
			);
			await pool.query(
				'INSERT INTO "user" (id, email, "pendingEmail", "pendingEmailRequestId") VALUES ($1,$2,$3,$4)',
				["owner", "old@example.com", "new@example.com", "request"],
			);
			const user = pgTable("user", {
				id: text("id").primaryKey(),
				name: text("name"),
				email: text("email"),
				emailVerified: boolean("emailVerified"),
				image: text("image"),
				createdAt: timestamp("createdAt"),
				updatedAt: timestamp("updatedAt"),
				pendingEmail: text("pendingEmail"),
				pendingEmailRequestId: text("pendingEmailRequestId"),
			});
			const cancel = await pool.connect();
			const verify = await pool.connect();
			try {
				await cancel.query("BEGIN");
				await cancel.query(
					'UPDATE "user" SET "pendingEmail"=NULL, "pendingEmailRequestId"=NULL WHERE id=$1',
					["owner"],
				);
				const pid = (
					await verify.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
				).rows[0]?.pid;
				if (pid === undefined)
					throw new Error("Missing PostgreSQL backend identifier");
				const adapter = drizzleAdapter(drizzle(verify, { schema: { user } }), {
					provider: "pg",
					schema: { user },
				})({
					user: {
						changeEmail: { enabled: true, strategy: "verification-table" },
					},
				});
				const attempt = adapter.incrementOne({
					model: "user",
					where: [
						{ field: "id", value: "owner" },
						{ field: "email", value: "old@example.com" },
						{ field: "pendingEmail", value: "new@example.com" },
						{ field: "pendingEmailRequestId", value: "request" },
					],
					increment: {},
					set: {
						email: "new@example.com",
						pendingEmail: null,
						pendingEmailRequestId: null,
					},
				});
				try {
					await expect
						.poll(
							async () =>
								(
									await pool.query(
										"SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",
										[pid],
									)
								).rows[0]?.wait_event_type,
						)
						.toBe("Lock");
				} finally {
					await cancel.query("COMMIT");
				}
				expect(await attempt).toBeNull();
				expect(
					(await pool.query('SELECT email, "pendingEmail" FROM "user"')).rows,
				).toEqual([{ email: "old@example.com", pendingEmail: null }]);
			} finally {
				await cancel.query("ROLLBACK");
				cancel.release();
				verify.release();
			}
		} finally {
			await pool.end();
			await admin.query(`DROP DATABASE "${database}"`);
			await admin.end();
		}
	},
);
