import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { createTestHarness } from "wrangler";

/** Holds the query request open, and answers `/held` once it arrives. */
let queryHeld = false;
let stallURL = "";
const stallServer = createServer((req, res) => {
	if (req.url === "/held") {
		const answer = () => (queryHeld ? res.end() : setTimeout(answer, 10));
		answer();
		return;
	}
	queryHeld = true;
});

const server = createTestHarness({
	workers: [
		{
			config: {
				name: "verification-lock",
				main: "src/verification-lock.ts",
				compatibility_date: "2026-08-17",
				compatibility_flags: ["nodejs_compat"],
				alias: { kysely: "kysely-029" },
				d1_databases: [
					{ binding: "DB", database_id: "REPLACE_ME", database_name: "db" },
				],
			},
		},
	],
});

beforeAll(async () => {
	await new Promise<void>((resolve) =>
		stallServer.listen(0, "127.0.0.1", resolve),
	);
	stallURL = `http://127.0.0.1:${(stallServer.address() as AddressInfo).port}`;
	await server.listen();
	const setup = await server.fetch(
		`/setup?stall=${encodeURIComponent(stallURL)}`,
	);
	expect(setup.status).toBe(204);
});

afterEach(({ task }) => {
	if (task.result?.state === "fail") server.debug();
});

afterAll(async () => {
	await server.close();
	stallServer.closeAllConnections();
	await new Promise((resolve) => stallServer.close(resolve));
});

/**
 * @see https://github.com/better-auth/better-auth/issues/12397
 */
it("does not wait on a consume held by a request that has ended", async () => {
	const start = await server.fetch("/start");
	expect(start.status).toBe(204);
	expect(queryHeld).toBe(true);

	const response = await server.fetch("/run");
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({ value: "consumed" });
});
