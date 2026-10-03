import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
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
 * @see https://github.com/better-auth/better-auth/issues/11483
 */
it("lets independent D1 requests complete while another query is pending", async () => {
	const slowRequest = server.fetch(
		"http://localhost:8787/_test/d1-concurrency/slow",
	);
	await vi.waitFor(async () => {
		const response = await server.fetch(
			"http://localhost:8787/_test/d1-concurrency/status",
		);
		expect(await response.json()).toEqual({ slowQueryStarted: true });
	});

	const fastRequest = server.fetch(
		"http://localhost:8787/_test/d1-concurrency/fast",
	);
	const completedFirst = await Promise.race([
		slowRequest.then(() => "slow"),
		fastRequest.then(() => "fast"),
	]);
	const [slowResponse, fastResponse] = await Promise.all([
		slowRequest,
		fastRequest,
	]);

	expect(slowResponse.status).toBe(204);
	expect(fastResponse.status).toBe(204);
	expect(completedFirst).toBe("fast");
});
