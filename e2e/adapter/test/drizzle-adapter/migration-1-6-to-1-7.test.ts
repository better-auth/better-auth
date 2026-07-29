import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { getMigrations, migrateFrom16 } from "better-auth/db/migration";
import { jwt } from "better-auth/plugins";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { expect, it } from "vitest";
import { seedPublishedOAuthProviderData } from "../kysely-adapter/published-1-6-25-fixture";
import { generateDrizzleSchema } from "./generate-schema";

it("migrates published 1.6.25 accounts and OAuth records through the Drizzle adapter", async () => {
	const sqlite = new Database(":memory:");
	try {
		await seedPublishedOAuthProviderData({
			database: sqlite,
			emailDomain: "drizzle-migration.example.com",
			nameSuffix: "Drizzle Migration",
		});

		const currentOptions = {
			baseURL: "http://localhost:3000",
			emailAndPassword: { enabled: true },
			plugins: [
				jwt(),
				oauthProvider({
					consentPage: "/consent",
					loginPage: "/login",
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
					storeClientSecret: "hashed",
				}),
			],
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

		await expect(
			migrateFrom16(auth17.options, {
				oauthProvider: {
					clients: "migrate",
					clientSecrets: { source: "plain", target: "hashed" },
					consents: "migrate",
					tokens: "revoke",
				},
			}),
		).resolves.toMatchObject({
			accounts: {
				migrated: 1,
				providers: { credential: 1 },
			},
			oauthProvider: {
				clients: { migrated: 1 },
				consents: { migrated: 1 },
				tokens: { revoked: 1 },
			},
		});
		await expect(
			auth17.api.signInEmail({
				body: {
					email: "provider-owner@drizzle-migration.example.com",
					password: "correct-horse-battery-staple",
				},
			}),
		).resolves.toMatchObject({
			user: { name: "Drizzle Migration Provider Owner" },
		});
	} finally {
		sqlite.close();
	}
});
