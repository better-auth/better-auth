import fs from "fs/promises";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { user } from "./schema";
import { runAdapterTest } from "../../test";
import { drizzleAdapter } from "..";
import { getMigrations } from "../../../cli/utils/get-migration";
import path from "path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";

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

	const db = drizzle(database, {
		schema: {
			user,
		},
	});

	const adapter = drizzleAdapter(db, {
		provider: "pg",
	});

	it("should create schema", async () => {
		const res = await adapter.createSchema!({
			database: new Database(path.join(__dirname, "test.db")),
		});
		expect(res.code).toMatchSnapshot("__snapshots__/adapter.drizzle");
	});

	await runAdapterTest({
		adapter,
	});
});
