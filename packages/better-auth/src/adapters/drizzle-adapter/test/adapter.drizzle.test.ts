import fs from "fs/promises";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "./schema";
import { runAdapterTest } from "../../test";
import { drizzleAdapter } from "..";
import { getMigrations } from "../../../db/get-migration";
import path from "path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import type { BetterAuthOptions } from "../../../types";

describe("adapter test", async () => {
	const database = new Database(path.join(__dirname, "test.db"));
	const opts = {
		database,
		user: {
			fields: {
				email: "email_address",
			},
		},
		session: {
			modelName: "sessions",
		},
	} satisfies BetterAuthOptions;
	beforeEach(async () => {
		const { runMigrations } = await getMigrations(opts);
		await runMigrations();
	});

	afterAll(async () => {
		await fs.unlink(path.join(__dirname, "test.db"));
	});

	const db = drizzle(database);
	const adapter = drizzleAdapter(db, {
		provider: "pg",
		schema,
	});

	await runAdapterTest({
		adapter: adapter(opts),
	});
});
