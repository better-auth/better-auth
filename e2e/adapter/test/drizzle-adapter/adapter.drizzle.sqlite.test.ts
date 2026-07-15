import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { testAdapter } from "@better-auth/test-utils/adapter";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import {
	authFlowTestSuite,
	caseInsensitiveTestSuite,
	joinsTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	transactionsTestSuite,
	uuidTestSuite,
} from "../adapter-factory";
import {
	clearSchemaCache,
	generateDrizzleSchema,
	resetGenerationCount,
} from "./generate-schema";

const dbFilePath = path.join(import.meta.dirname, "test.db");
let sqliteDB = new Database(dbFilePath);

describe("Drizzle synchronous SQLite atomic writes", () => {
	it("commits ordered results and rolls back failed predeclared writes", async () => {
		const database = new Database(":memory:");
		try {
			database.exec(`
				CREATE TABLE user (
					id TEXT PRIMARY KEY,
					name TEXT NOT NULL,
					email TEXT NOT NULL UNIQUE,
					emailVerified INTEGER NOT NULL,
					image TEXT,
					createdAt INTEGER NOT NULL,
					updatedAt INTEGER NOT NULL
				)
			`);
			const user = sqliteTable("user", {
				id: text("id").primaryKey(),
				name: text("name").notNull(),
				email: text("email").notNull().unique(),
				emailVerified: integer("emailVerified", { mode: "boolean" }).notNull(),
				image: text("image"),
				createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
				updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
			});
			const adapter = drizzleAdapter(drizzle(database, { schema: { user } }), {
				provider: "sqlite",
				schema: { user },
				transaction: "sync",
			})({ secret: "test-secret-that-is-at-least-32-chars-long!!" });
			const now = new Date();
			const createdUser = {
				id: "atomic-user",
				name: "Atomic User",
				email: "atomic@example.com",
				emailVerified: false,
				image: null,
				createdAt: now,
				updatedAt: now,
			};
			const staleUser = {
				...createdUser,
				id: "stale-user",
				email: "stale@example.com",
			};
			expect(adapter.commitAtomicWrites).toBeTypeOf("function");
			expect(adapter.options?.adapterConfig.transaction).toBe(false);
			await expect(
				adapter.commitAtomicWrites?.([
					{
						type: "create",
						model: "user",
						data: createdUser,
						forceAllowId: true,
					},
					{
						type: "update",
						model: "user",
						where: [{ field: "id", value: createdUser.id }],
						update: { name: "Updated Atomic User" },
					},
					{
						type: "delete",
						model: "user",
						where: [{ field: "id", value: createdUser.id }],
					},
					{
						type: "create",
						model: "user",
						data: staleUser,
						forceAllowId: true,
					},
					{
						type: "deleteMany",
						model: "user",
						where: [{ field: "email", value: staleUser.email }],
					},
				]),
			).resolves.toEqual([
				{ type: "create", record: createdUser },
				{
					type: "update",
					record: {
						...createdUser,
						name: "Updated Atomic User",
						updatedAt: expect.any(Date),
					},
				},
				{ type: "delete", deletedCount: 1 },
				{ type: "create", record: staleUser },
				{ type: "deleteMany", deletedCount: 1 },
			]);

			await expect(
				adapter.commitAtomicWrites?.([
					{
						type: "create",
						model: "user",
						data: { ...createdUser, id: "rollback-user" },
						forceAllowId: true,
					},
					{
						type: "create",
						model: "user",
						data: {
							...createdUser,
							id: "rollback-user",
							email: "rollback-duplicate@example.com",
						},
						forceAllowId: true,
					},
				]),
			).rejects.toThrow();
			expect(
				database
					.prepare("SELECT id FROM user WHERE id = ?")
					.get("rollback-user"),
			).toBeUndefined();
		} finally {
			database.close();
		}
	});
});

const { execute } = await testAdapter({
	adapter: async (options) => {
		const { schema } = await generateDrizzleSchema(sqliteDB, options, "sqlite");
		return drizzleAdapter(drizzle(sqliteDB, { schema }), {
			debugLogs: { isRunningAdapterTests: true },
			schema,
			provider: "sqlite",
			transaction: "sync",
		});
	},
	async runMigrations(betterAuthOptions) {
		sqliteDB.close();
		try {
			await fs.unlink(dbFilePath);
		} catch {
			console.log("db file not found");
		}
		sqliteDB = new Database(dbFilePath);

		const { fileName } = await generateDrizzleSchema(
			sqliteDB,
			betterAuthOptions,
			"sqlite",
		);

		const command = `npx drizzle-kit push --dialect=sqlite --schema=${fileName}.ts --url=./test.db`;
		console.log(`Running: ${command}`);
		console.log(`Options:`, betterAuthOptions);
		try {
			// wait for the above console.log to be printed
			await new Promise((resolve) => setTimeout(resolve, 10));
			execSync(command, {
				cwd: import.meta.dirname,
				stdio: "inherit",
			});
		} catch (error) {
			console.error("Failed to push drizzle schema (sqlite):", error);
			throw error;
		}
	},
	prefixTests: "sqlite",
	tests: [
		normalTestSuite(),
		transactionsTestSuite({ disableTests: { ALL: true } }),
		authFlowTestSuite(),
		numberIdTestSuite(),
		joinsTestSuite(),
		uuidTestSuite(),
		caseInsensitiveTestSuite(),
	],
	async onFinish() {
		clearSchemaCache();
		resetGenerationCount();
	},
});

execute();
