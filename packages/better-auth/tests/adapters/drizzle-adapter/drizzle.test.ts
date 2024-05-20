import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe } from "vitest";
import { runAdapterTest } from "../adapter-test";
import { drizzleAdapter } from "./../../../src/adapters/drizzle";
import { db, deleteDb } from "./schema";
import { user } from "./schema";

describe("adapter test", async () => {
	beforeAll(async () => {
		await db.run(sql`
            CREATE TABLE IF NOT EXISTS user (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE,
                name TEXT,
                emailVerified INTEGER DEFAULT 0 CHECK (emailVerified IN (0, 1)),
                password TEXT
            );
        `);
	});
	const adapter = drizzleAdapter({
		db: db,
		schema: {
			user,
		},
	});
	await runAdapterTest({
		adapter,
	});
	afterAll(async () => {
		await deleteDb();
	});
});
