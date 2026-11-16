import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestHarness } from "wrangler";

/** Holds the first request to each path open; answers later ones with a discovery document. */
const held = new Set<string>();
let stallURL = "";
const stallServer = createServer((req, res) => {
	const path = req.url ?? "";
	if (path.startsWith("/held?")) {
		const target = new URL(path, stallURL).searchParams.get("path") ?? "";
		const answer = () =>
			held.has(target) ? res.end() : setTimeout(answer, 10);
		answer();
		return;
	}
	if (!held.has(path)) {
		held.add(path);
		return;
	}
	res.writeHead(200, { "content-type": "application/json" }).end(
		JSON.stringify({
			issuer: stallURL,
			authorization_endpoint: `${stallURL}/authorize`,
			token_endpoint: `${stallURL}/token`,
			jwks_uri: `${stallURL}/jwks`,
		}),
	);
});

const server = createTestHarness({
	workers: [
		{
			config: {
				name: "plugin-retry",
				main: "src/plugin-retry.ts",
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
 * @see https://github.com/better-auth/better-auth/issues/10315
 */
describe("plugin retries in an auth instance created at module scope", () => {
	it.each([
		{
			op: "discovery",
			expected: expect.stringMatching(/\/authorize\?/),
		},
		{ op: "seed", expected: ["https://api.example.com"] },
	])(
		"a request does not wait on an ended request's $op retry",
		async ({ op, expected }) => {
			const start = await server.fetch(`/start?op=${op}`);
			expect(start.status).toBe(204);
			expect(held.has(`/${op}`)).toBe(true);

			const response = await server.fetch(`/run?op=${op}`);
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual(expected);
		},
	);
});
