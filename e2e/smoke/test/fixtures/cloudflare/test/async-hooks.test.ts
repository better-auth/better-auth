import {
	afterEach,
	describe,
	expect,
	it,
	onTestFailed,
	onTestFinished,
	vi,
} from "vitest";
import { createTestHarness } from "wrangler";

const workerConfig = {
	name: "async-hooks",
	main: "src/async-hooks.ts",
	compatibility_date: "2026-08-17",
	compatibility_flags: ["nodejs_compat"],
};

afterEach(() => {
	vi.unstubAllEnvs();
});

/**
 * @see https://github.com/better-auth/better-auth/issues/10315
 * @see https://developers.cloudflare.com/workers/configuration/compatibility-flags/#handle-cross-request-promise-resolution-correctly
 */
describe("AsyncLocalStorage loading in Workers", () => {
	it.each([
		{ name: "packaged module", waitUntil: false },
		{ name: "waitUntil control", waitUntil: true },
		{
			name: "workerd and edge conditions",
			waitUntil: false,
			conditions: "workerd,edge,browser",
		},
		{
			name: "workspace source",
			waitUntil: false,
			conditions: "dev-source,workerd,node,edge,browser",
		},
		{
			name: "ALS-only compatibility",
			waitUntil: false,
			compatibilityDate: "2024-09-23",
			compatibilityFlags: ["nodejs_als"],
		},
	])(
		"preserves later request contexts after an early response: $name",
		async ({
			conditions,
			waitUntil,
			compatibilityDate,
			compatibilityFlags,
		}) => {
			vi.stubEnv("WRANGLER_BUILD_CONDITIONS", conditions);
			const server = createTestHarness({
				workers: [
					{
						config: {
							...workerConfig,
							compatibility_date:
								compatibilityDate ?? workerConfig.compatibility_date,
							compatibility_flags:
								compatibilityFlags ?? workerConfig.compatibility_flags,
						},
					},
				],
			});
			onTestFailed(() => {
				server.debug();
			});
			onTestFinished(async () => {
				await server.close();
			});
			await server.listen();
			const initial = (await (await server.fetch("/status")).json()) as {
				instance: string;
				moduleLoaded: boolean;
			};
			expect(initial).toMatchObject({
				instance: expect.any(String),
				moduleLoaded: false,
			});
			const response = await server.fetch(`/start?waitUntil=${waitUntil}`);
			expect(response.status).toBe(204);

			await expect
				.poll(async () => (await server.fetch("/status")).json())
				.toMatchObject({ moduleLoaded: true });

			const results = await Promise.all(
				Array.from({ length: 32 }, async (_, id) => {
					const response = await server.fetch(`/join?id=${id}`);
					const body: unknown = await response.json();
					return { status: response.status, body };
				}),
			);
			for (const [id, result] of results.entries()) {
				expect(result.status).toBe(200);
				expect(result.body).toEqual({
					outcome: "completed",
					instance: initial.instance,
					id: String(id),
					store: String(id),
				});
			}
		},
	);
});
