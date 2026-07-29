import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { getMigrations, migrateFrom16 } from "better-auth/db/migration";
import { betterAuth as betterAuth1625 } from "better-auth-1-6-25";
import { getMigrations as getMigrations1625 } from "better-auth-1-6-25/db/migration";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { expect, it } from "vitest";
import { generateDrizzleSchema } from "./generate-schema";

it("migrates a published 1.6.25 SQLite database through the Drizzle adapter", async () => {
	const sqlite = new Database(":memory:");
	try {
		const auth1625 = betterAuth1625({
			baseURL: "http://localhost:3000",
			database: sqlite,
			emailAndPassword: { enabled: true },
		});
		await (await getMigrations1625(auth1625.options)).runMigrations();
		await auth1625.api.signUpEmail({
			body: {
				email: "drizzle-migration@example.com",
				name: "Drizzle Migration",
				password: "correct-horse-battery-staple",
			},
		});

		const currentOptions = {
			baseURL: "http://localhost:3000",
			emailAndPassword: { enabled: true },
		};
		const { schema } = await generateDrizzleSchema(
			sqlite,
			currentOptions,
			"sqlite",
			{ camelCase: true },
		);
		const database = drizzleAdapter(drizzle(sqlite, { schema }), {
			camelCase: true,
			provider: "sqlite",
			schema,
		});
		const auth17 = betterAuth({ ...currentOptions, database });
		const inspection = await getMigrations(auth17.options);

		expect(inspection.migrationTarget).toEqual({
			adapter: "drizzle",
			dialect: "sqlite",
		});
		expect(inspection.migrationBlockers).toContainEqual({
			code: "required-column-backfill",
			columns: ["issuer", "providerAccountId"],
			table: "account",
		});

		await expect(migrateFrom16(auth17.options, {})).resolves.toMatchObject({
			accounts: {
				migrated: 1,
				providers: { credential: 1 },
			},
		});
		await expect(
			auth17.api.signInEmail({
				body: {
					email: "drizzle-migration@example.com",
					password: "correct-horse-battery-staple",
				},
			}),
		).resolves.toMatchObject({
			user: { name: "Drizzle Migration" },
		});
	} finally {
		sqlite.close();
	}
});
