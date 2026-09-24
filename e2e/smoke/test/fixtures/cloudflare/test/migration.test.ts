import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { createTestHarness } from "wrangler";

const server = createTestHarness({
	workers: [{ configPath: "./wrangler.json" }],
});

beforeAll(async () => {
	await server.listen();
});

afterEach(({ task }) => {
	if (task.result?.state === "fail") server.debug();
});

afterAll(async () => {
	await server.close();
});

/**
 * @see https://github.com/better-auth/better-auth/issues/10551
 */
it("runs built-in migrations repeatedly on D1", async () => {
	const firstResponse = await server.fetch(
		"http://localhost:8787/_test/migrate",
		{
			method: "POST",
		},
	);
	expect(firstResponse.status).toBe(204);

	const secondResponse = await server.fetch(
		"http://localhost:8787/_test/migrate",
		{
			method: "POST",
		},
	);
	expect(secondResponse.status).toBe(204);
});

/**
 * @see https://developers.cloudflare.com/d1/sql-api/sql-statements/#pragma-index_listtable_name
 */
it("distinguishes rowid keys from indexed primary keys on D1", async () => {
	const { DB } = await server.getWorker<CloudflareBindings>().getEnv();
	await DB.exec("CREATE TABLE generated (id INTEGER PRIMARY KEY)");
	await DB.exec("CREATE TABLE descending (id INTEGER PRIMARY KEY DESC)");

	const results = await DB.batch<{ origin: string }>([
		DB.prepare("PRAGMA index_list('generated')"),
		DB.prepare("PRAGMA index_list('descending')"),
	]);

	expect(
		results.map((result) =>
			result.results?.some((index) => index.origin === "pk"),
		),
	).toEqual([false, true]);
});
