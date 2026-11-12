import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { createTestHarness } from "wrangler";

const server = createTestHarness({
	workers: [
		{
			config: {
				name: "module-scope",
				main: "src/module-scope.ts",
				compatibility_date: "2026-08-17",
				compatibility_flags: ["nodejs_compat"],
				alias: { kysely: "kysely-029" },
				// Telemetry is a noop without an endpoint. `debug` logs events instead of sending them.
				vars: {
					BETTER_AUTH_TELEMETRY_ENDPOINT: "https://telemetry.example.com",
				},
				d1_databases: [
					{ binding: "DB", database_id: "REPLACE_ME", database_name: "db" },
				],
			},
		},
	],
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
 * @see https://github.com/better-auth/better-auth/issues/12400
 */
it("starts an auth instance at module scope without logging an error", async () => {
	const logs = (await (await server.fetch("/logs")).json()) as string[];
	expect(logs.filter((log) => log.startsWith("error"))).toEqual([]);
});

/**
 * @see https://github.com/better-auth/better-auth/issues/12399
 */
it("serves requests with telemetry enabled and no static base URL", async () => {
	expect((await server.fetch("/setup")).status).toBe(204);
	const response = await server.fetch("/api/auth/ok?telemetry");
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ ok: true });
});
