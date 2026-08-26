import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { oauthProvider } from "@better-auth/oauth-provider";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { betterAuth } from "better-auth";
import { getMigrations, migrateFrom16 } from "better-auth/db/migration";
import { jwt } from "better-auth/plugins";
import Database from "better-sqlite3";
import { expect, it } from "vitest";
import { seedPublishedOAuthProviderData } from "../kysely-adapter/published-1-6-30-fixture";
import { PrismaClient } from "./.tmp/prisma-client-migration-mapped/client";

it("migrates published 1.6.30 accounts and OAuth records through the Prisma adapter", async () => {
	const temporaryDirectory = await fs.mkdtemp(
		path.join(os.tmpdir(), "better-auth-prisma-migration-"),
	);
	const databasePath = path.join(temporaryDirectory, "migration.db");
	let sqlite: Database.Database | undefined;
	let prisma: PrismaClient | undefined;
	try {
		sqlite = new Database(databasePath);
		await seedPublishedOAuthProviderData({
			database: sqlite,
			emailDomain: "prisma-migration.example.com",
			nameSuffix: "Prisma Migration",
		});
		const sourceAccountColumns = sqlite
			.prepare("PRAGMA table_info(account)")
			.all()
			.map((column) => (column as { name: string }).name);
		expect(sourceAccountColumns).toContain("accountId");
		sqlite.exec(`
			ALTER TABLE account RENAME COLUMN accountId TO account_id;
			ALTER TABLE account RENAME COLUMN providerId TO provider_id;
			ALTER TABLE account RENAME COLUMN userId TO user_id;
		`);
		const mappedSourceAccountColumns = sqlite
			.prepare("PRAGMA table_info(account)")
			.all()
			.map((column) => (column as { name: string }).name);
		expect(mappedSourceAccountColumns).toContain("account_id");
		expect(mappedSourceAccountColumns).not.toContain("identity_issuer");
		sqlite.close();
		sqlite = undefined;

		prisma = new PrismaClient({
			adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}` }),
		});
		const auth17 = betterAuth({
			account: { identityStrategy: "provider-id" },
			baseURL: "http://localhost:3000",
			database: prismaAdapter(prisma, {
				provider: "sqlite",
			}),
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
		});
		const inspection = await getMigrations(auth17.options);

		expect(inspection.toBeCreated).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					table: "oauthClient",
				}),
			]),
		);
		expect(
			Object.keys(
				inspection.toBeAdded.find(({ table }) => table === "account")?.fields ??
					{},
			),
		).toEqual(expect.arrayContaining(["identity_issuer"]));
		expect(inspection.migrationTarget).toEqual({
			adapter: "prisma",
			dialect: "sqlite",
		});
		expect(inspection.migrationBlockers).toContainEqual({
			code: "required-column-backfill",
			columns: ["identity_issuer"],
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
					email: "provider-owner@prisma-migration.example.com",
					password: "correct-horse-battery-staple",
				},
			}),
		).resolves.toMatchObject({
			user: { name: "Prisma Migration Provider Owner" },
		});
	} finally {
		sqlite?.close();
		await prisma?.$disconnect();
		await fs.rm(temporaryDirectory, { force: true, recursive: true });
	}
});
