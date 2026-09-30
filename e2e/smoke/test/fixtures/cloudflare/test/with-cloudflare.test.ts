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
 * @see https://github.com/better-auth/better-auth/issues/10315
 */
it("serves a request from an instance wrapped at module scope", async () => {
	const response = await server.fetch(
		"http://localhost:8787/_test/cloudflare/module-scope",
	);
	expect(await response.json()).toEqual({ outcome: "settled" });
});

/**
 * @see https://github.com/better-auth/better-auth/issues/10315
 */
it("settles initialization for a later request after the request that started it responded", async () => {
	const started = await server.fetch(
		"http://localhost:8787/_test/cloudflare/init/start",
	);
	expect(started.status).toBe(204);

	const joined = await server.fetch(
		"http://localhost:8787/_test/cloudflare/init/join",
	);
	expect(await joined.json()).toEqual({ outcome: "settled" });
});

/**
 * @see https://github.com/better-auth/better-auth/issues/10315
 */
it("settles the schema check for a later request after the request that started it responded", async () => {
	const migrated = await server.fetch("http://localhost:8787/_test/migrate", {
		method: "POST",
	});
	expect(migrated.status).toBe(204);

	const started = await server.fetch(
		"http://localhost:8787/_test/cloudflare/schema-check/start",
	);
	expect(started.status).toBe(204);

	const joined = await server.fetch(
		"http://localhost:8787/_test/cloudflare/schema-check/join",
	);
	expect(await joined.json()).toEqual({ outcome: "settled" });
});
