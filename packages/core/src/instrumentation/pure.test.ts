// cspell:ignore workerd
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { withSpan } from "./pure.index";

type CorePackageJSON = {
	exports: {
		"./instrumentation": {
			workerd: string;
		};
	};
};

// @see https://github.com/better-auth/better-auth/issues/8765
describe("instrumentation (pure entry)", () => {
	it("returns the result of a sync fn", () => {
		expect(withSpan("test.sync", { k: 1 }, () => 42)).toBe(42);
	});

	it("returns the result of an async fn", async () => {
		await expect(
			withSpan("test.async", { k: 1 }, async () => {
				await Promise.resolve();
				return "ok";
			}),
		).resolves.toBe("ok");
	});

	it("propagates sync throws", () => {
		expect(() =>
			withSpan("test.sync.err", {}, () => {
				throw new Error("boom");
			}),
		).toThrow("boom");
	});

	it("propagates async rejections", async () => {
		await expect(
			withSpan("test.async.err", {}, async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
	});

	it("does not load `@opentelemetry/api` at runtime", async () => {
		vi.resetModules();
		const loadOpenTelemetry = vi.fn(() => {
			throw new Error("OpenTelemetry is unavailable");
		});
		vi.doMock("@opentelemetry/api", loadOpenTelemetry);
		try {
			const mod = await import("./pure.index");
			expect(mod.withSpan("pure", {}, () => 42)).toBe(42);
			const run = mod.createWithSpan({
				experimental: { instrumentation: { enabled: true } },
			});
			await expect(run("pure async", {}, async () => 42)).resolves.toBe(42);
			expect(loadOpenTelemetry).not.toHaveBeenCalled();
		} finally {
			vi.doUnmock("@opentelemetry/api");
			vi.resetModules();
		}
	});

	it("does not export symbols beyond the public surface of ./index", async () => {
		const pure = await import("./pure.index");
		const main = await import("./index");
		expect(Object.keys(pure).sort()).toEqual(Object.keys(main).sort());
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9365
	 */
	it("routes workerd package imports to the pure instrumentation entry", () => {
		const pkg = JSON.parse(
			readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
		) as CorePackageJSON;

		expect(pkg.exports["./instrumentation"].workerd).toBe(
			"./dist/instrumentation/pure.index.mjs",
		);
	});
});
