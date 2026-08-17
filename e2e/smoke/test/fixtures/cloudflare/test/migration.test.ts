import { afterAll, beforeAll, expect, it } from "vitest";
import { createTestHarness } from "wrangler";

const server = createTestHarness({
	workers: [{ configPath: "./wrangler.json" }],
});

beforeAll(async () => {
	await server.listen();
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
	if (!firstResponse.ok) server.debug();
	expect(firstResponse.status).toBe(204);

	const secondResponse = await server.fetch(
		"http://localhost:8787/_test/migrate",
		{
			method: "POST",
		},
	);
	if (!secondResponse.ok) server.debug();
	expect(secondResponse.status).toBe(204);
});
