import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { betterAuth } from "better-auth";
import { getMigrations, migrateFrom16 } from "better-auth/db/migration";
import { betterAuth as betterAuth1625 } from "better-auth-1-6-25";
import { getMigrations as getMigrations1625 } from "better-auth-1-6-25/db/migration";
import Database from "better-sqlite3";
import { expect, it } from "vitest";
import { PrismaClient } from "./.tmp/prisma-client-base/client";

it("migrates a published 1.6.25 SQLite database through the Prisma adapter", async () => {
	const temporaryDirectory = await fs.mkdtemp(
		path.join(os.tmpdir(), "better-auth-prisma-migration-"),
	);
	const databasePath = path.join(temporaryDirectory, "migration.db");
	let sqlite: Database.Database | undefined;
	let prisma: PrismaClient | undefined;
	try {
		sqlite = new Database(databasePath);
		const auth1625 = betterAuth1625({
			baseURL: "http://localhost:3000",
			database: sqlite,
			emailAndPassword: { enabled: true },
		});
		await (await getMigrations1625(auth1625.options)).runMigrations();
		await auth1625.api.signUpEmail({
			body: {
				email: "prisma-migration@example.com",
				name: "Prisma Migration",
				password: "correct-horse-battery-staple",
			},
		});
		const sourceAccountColumns = sqlite
			.prepare("PRAGMA table_info(account)")
			.all()
			.map((column) => (column as { name: string }).name);
		expect(sourceAccountColumns).toContain("accountId");
		expect(sourceAccountColumns).not.toContain("issuer");
		sqlite.close();
		sqlite = undefined;

		prisma = new PrismaClient({
			adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}` }),
		});
		const auth17 = betterAuth({
			baseURL: "http://localhost:3000",
			database: prismaAdapter(prisma, {
				provider: "sqlite",
			}),
			emailAndPassword: { enabled: true },
		});
		const inspection = await getMigrations(auth17.options);

		expect(inspection.toBeCreated).toEqual([]);
		expect(
			Object.keys(
				inspection.toBeAdded.find(({ table }) => table === "account")?.fields ??
					{},
			),
		).toEqual(expect.arrayContaining(["issuer", "providerAccountId"]));
		expect(inspection.migrationTarget).toEqual({
			adapter: "prisma",
			dialect: "sqlite",
		});
		expect(inspection.migrationBlockers).toContainEqual({
			code: "required-column-backfill",
			columns: ["issuer", "providerAccountId"],
			table: "account",
		});

		await expect(
			migrateFrom16(auth17.options, {
				accountIssuers: { credential: "local:credential" },
			}),
		).resolves.toMatchObject({
			accounts: {
				migrated: 1,
				providers: { credential: 1 },
			},
		});
		await expect(
			auth17.api.signInEmail({
				body: {
					email: "prisma-migration@example.com",
					password: "correct-horse-battery-staple",
				},
			}),
		).resolves.toMatchObject({
			user: { name: "Prisma Migration" },
		});
	} finally {
		sqlite?.close();
		await prisma?.$disconnect();
		await fs.rm(temporaryDirectory, { force: true, recursive: true });
	}
});
