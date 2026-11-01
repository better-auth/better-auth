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
	let slowStatus: number;
	try {
		await vi.waitFor(
			async () => {
				const response = await server.fetch(
					"http://localhost:8787/_test/d1-concurrency/status",
				);
				expect(await response.json()).toEqual({ slowQueryStarted: true });
			},
			{ timeout: 5000 },
		);

		const fastResponse = await server.fetch(
			"http://localhost:8787/_test/d1-concurrency/fast",
			{ signal: AbortSignal.timeout(5000) },
		);
		expect(fastResponse.status).toBe(204);
	} finally {
		await server.fetch("http://localhost:8787/_test/d1-concurrency/release");
		slowStatus = (await slowRequest).status;
	}

	expect(slowStatus).toBe(204);
}, 15_000);
