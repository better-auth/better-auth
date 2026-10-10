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
 * @see https://kysely-org.github.io/kysely-apidoc/classes/SqliteAdapter.html#acquiremigrationlock
 */
it("runs a D1 migration only once when two Kysely migrators start together", async () => {
	const response = await server.fetch(
		"http://localhost:8787/_test/d1-migration-lock",
	);
	expect(response.status).toBe(200);
	const result: unknown = await response.json();
	expect(result).toEqual({
		migrationStarts: 1,
		recorded: 1,
		errors: [null, null],
	});
}, 15_000);
