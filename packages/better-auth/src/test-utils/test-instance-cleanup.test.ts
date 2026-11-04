import { DatabaseSync } from "node:sqlite";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { afterAll, expect, it } from "vitest";

let sqlite: DatabaseSync | undefined;
let postgres: Kysely<unknown> | undefined;

// Vitest runs afterAll hooks in reverse registration order, and test-instance
// registers its cleanup hook when it is imported. Registering this hook before
// that import makes it run after the cleanup. Each check needs the handle its
// test captured, so a run filtered with `-t` skips the other backend's check.
afterAll(async () => {
	if (sqlite) {
		expect(sqlite.isOpen).toBe(false);
	}
	if (postgres) {
		await expect(sql`select 1`.execute(postgres)).rejects.toThrow(
			"driver has already been destroyed",
		);
	}
});

const { getTestInstance } = await import("./test-instance");

let fileHookAuth:
	| Awaited<ReturnType<typeof getTestInstance>>["auth"]
	| undefined;

// Registered after the import, so it runs before the cleanup closes the
// database, like an afterAll hook in any test file that uses getTestInstance.
afterAll(async () => {
	if (!fileHookAuth) {
		return;
	}
	const session = await fileHookAuth.api.signInEmail({
		body: { email: "test@test.com", password: "test123456" },
	});
	expect(session.user.email).toBe("test@test.com");
});

it("closes the SQLite database the instance used", async () => {
	const { auth } = await getTestInstance();
	const { database } = auth.options;
	expect.assert.instanceOf(database, DatabaseSync);
	expect(database.isOpen).toBe(true);
	sqlite = database;
	fileHookAuth = auth;
});

it("destroys the Postgres pool the instance used", async () => {
	const { auth } = await getTestInstance(undefined, {
		testWith: "postgres",
	});
	const { database } = auth.options;
	expect.assert(database && "db" in database);
	postgres = database.db;
	await expect(sql`select 1`.execute(postgres)).resolves.toBeDefined();
});
