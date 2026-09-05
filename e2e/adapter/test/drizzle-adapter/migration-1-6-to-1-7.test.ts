import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { getMigrations, migrateFrom16 } from "better-auth/db/migration";
import { jwt } from "better-auth/plugins";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { expect, it } from "vitest";
import { seedPublishedOAuthProviderData } from "../kysely-adapter/published-1-6-30-fixture";
import { generateDrizzleSchema } from "./generate-schema";

it("migrates published 1.6.30 accounts and OAuth records through the Drizzle adapter", async () => {
	const sqlite = new Database(":memory:");
	try {
		await seedPublishedOAuthProviderData({
			database: sqlite,
			emailDomain: "drizzle-migration.example.com",
			nameSuffix: "Drizzle Migration",
		});

		const currentOptions = {
			account: { identityStrategy: "provider-id" as const },
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
			transaction: true,
		});
		const auth17 = betterAuth({ ...currentOptions, database });
		const inspection = await getMigrations(auth17.options);

		expect(inspection.migrationTarget).toEqual({
			adapter: "drizzle",
			dialect: "sqlite",
		});
		expect(inspection.migrationBlockers).toContainEqual({
			code: "required-column-backfill",
			columns: ["issuer"],
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

it("plans an explicit provider-id upgrade against Drizzle snake_case columns", async () => {
	const sqlite = new Database(":memory:");
	try {
		sqlite.exec(`
			CREATE TABLE account (
				id TEXT PRIMARY KEY NOT NULL,
				account_id TEXT NOT NULL,
				provider_id TEXT NOT NULL,
				user_id TEXT NOT NULL,
				access_token TEXT,
				refresh_token TEXT,
				id_token TEXT,
				access_token_expires_at INTEGER,
				refresh_token_expires_at INTEGER,
				scope TEXT,
				password TEXT,
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			);
			CREATE UNIQUE INDEX account_provider_id_account_id_unique
				ON account (provider_id, account_id);
			INSERT INTO account (
				id, account_id, provider_id, user_id, created_at, updated_at
			) VALUES (
				'account-1', 'credential-user-1', 'credential', 'user-1', 0, 0
			);
		`);

		const currentOptions = {
			account: { identityStrategy: "provider-id" as const },
			baseURL: "http://localhost:3000",
			emailAndPassword: { enabled: true },
		};
		const { schema } = await generateDrizzleSchema(
			sqlite,
			currentOptions,
			"sqlite",
		);
		const database = drizzleAdapter(drizzle(sqlite, { schema }), {
			provider: "sqlite",
			schema,
			transaction: true,
		});
		const inspection = await getMigrations(
			betterAuth({ ...currentOptions, database }).options,
		);

		expect(inspection.accountIdentity).toMatchObject({
			selectedStrategy: "provider-id",
			detectedStrategy: "provider-id",
		});
		expect(inspection.migrationBlockers).not.toContainEqual(
			expect.objectContaining({
				code: "account-identity-strategy-mismatch",
			}),
		);
		const accountFields = Object.keys(
			inspection.toBeAdded.find(({ table }) => table === "account")?.fields ??
				{},
		);
		expect(accountFields).toContain("issuer");
		expect(accountFields).not.toContain("account_id");
		expect(accountFields).not.toContain("provider_id");
	} finally {
		sqlite.close();
	}
});
