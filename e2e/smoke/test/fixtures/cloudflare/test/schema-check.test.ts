import { describe, expect, it, onTestFailed, onTestFinished } from "vitest";
import { createTestHarness } from "wrangler";

/**
 * @see https://github.com/better-auth/better-auth/issues/11651
 */
describe("schema validation across Worker requests", () => {
	it.each([
		{ name: "early response", delay: 500, waitUntil: false },
		{ name: "waitUntil control", delay: 500, waitUntil: true },
		{ name: "D1 without an injected delay", delay: 0, waitUntil: false },
	])("validates later API and HTTP requests after $name", async ({
		delay,
		waitUntil,
	}) => {
		const server = createTestHarness({
			workers: [
				{
					config: {
						name: "schema-check",
						main: "src/schema-check.ts",
						compatibility_date: "2026-08-17",
						compatibility_flags: ["nodejs_compat"],
						d1_databases: [
							{ binding: "DB", database_id: "REPLACE_ME", database_name: "db" },
						],
					},
				},
			],
		});
		onTestFailed(() => server.debug());
		onTestFinished(() => server.close());
		await server.listen();
		const setup = await server.fetch("/setup");
		expect(setup.status).toBe(200);
		const { cookie } = (await setup.json()) as { cookie: string };
		expect(cookie).toContain("session_token=");

		const start = await server.fetch(
			`/start?delay=${delay}&waitUntil=${waitUntil}`,
		);
		expect(start.status).toBe(200);
		const initial = (await start.json()) as {
			instance: string;
			queriesStarted: number;
			queriesCompleted: number;
		};
		expect(initial.queriesStarted).toBeGreaterThan(0);
		if (delay > 0) expect(initial.queriesCompleted).toBe(0);

		const { DB } = await server.getWorker<CloudflareBindings>().getEnv();
		expect(await DB.prepare("SELECT 1 AS value").first()).toEqual({ value: 1 });
		const responses = await Promise.all(
			[false, true].map((http) =>
				server.fetch(`/session?http=${http}`, { headers: { cookie } }),
			),
		);
		for (const response of responses) {
			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				user: { email: "schema@example.com" },
			});
		}
		const completed = (await (await server.fetch("/status")).json()) as {
			instance: string;
			schemaLookups: number;
		};
		expect(completed.instance).toBe(initial.instance);
		expect(completed.schemaLookups).toBeGreaterThan(0);
		for (let index = 0; index < 3; index++) {
			const response = await server.fetch("/session", { headers: { cookie } });
			expect(response.status).toBe(200);
		}
		expect(await (await server.fetch("/status")).json()).toMatchObject({
			schemaLookups: completed.schemaLookups,
		});
		expect((await server.fetch("/migrate")).status).toBe(204);
		const migrated = (await (await server.fetch("/status")).json()) as {
			schemaLookups: number;
		};
		expect(
			(await server.fetch("/session", { headers: { cookie } })).status,
		).toBe(200);
		expect(await (await server.fetch("/status")).json()).toMatchObject({
			schemaLookups: migrated.schemaLookups + 1,
		});
	});
});
