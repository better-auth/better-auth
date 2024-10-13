import fs from "fs/promises";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runAdapterTest } from "../../test";
import { getMigrations } from "../../../cli/utils/get-migration";
import path from "path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { kyselyAdapter } from "..";
import { Kysely, SqliteDialect } from "kysely";
import { getTestInstance } from "../../../test-utils/test-instance";
import { organization, twoFactor } from "../../../plugins";

describe("adapter test", async () => {
	const database = new Database(path.join(__dirname, "test.db"));
	beforeEach(async () => {
		const { runMigrations } = await getMigrations({
			database,
		});
		await runMigrations();
	});

	afterAll(async () => {
		await fs.unlink(path.join(__dirname, "test.db"));
	});
	const sqlite = new Database(path.join(__dirname, "test.db"));
	const db = new Kysely({
		dialect: new SqliteDialect({
			database: sqlite,
		}),
	});

	const adapter = kyselyAdapter(db, {
		transform: {
			schema: {},
			boolean: true,
			date: true,
		},
	});

	it("should create schema", async () => {
		const res = await adapter.createSchema!({
			database: new Database(path.join(__dirname, "test-2.db")),
			plugins: [organization(), twoFactor()],
		});
		expect(res.code).toMatchSnapshot("__snapshots__/adapter.drizzle");
	});

	await runAdapterTest({
		adapter,
	});
});
