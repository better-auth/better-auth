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
 * @see https://github.com/better-auth/better-auth/issues/10832
 */
it("preserves async contexts across concurrent first calls in the Workers runtime", async () => {
	const response = await server.fetch(
		"http://localhost:8787/_test/async-context/concurrency",
	);
	expect(response.status).toBe(200);
	const body: unknown = await response.json();
	expect(body).toEqual({
		endpointContextMatches: 32,
		transactionAdapterMatches: 32,
		total: 32,
	});
});
