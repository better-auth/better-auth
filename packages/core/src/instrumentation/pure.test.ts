import { describe, expect, it } from "vitest";
import { withSpan } from "./pure.index";

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

	it("does not reference `@opentelemetry/api` at runtime", async () => {
		const mod = await import("./pure.index");
		expect(mod.withSpan.toString()).not.toContain("opentelemetry");
	});

	it("does not export symbols beyond the public surface of ./index", async () => {
		const pure = await import("./pure.index");
		const main = await import("./index");
		expect(Object.keys(pure).sort()).toEqual(Object.keys(main).sort());
	});
});
