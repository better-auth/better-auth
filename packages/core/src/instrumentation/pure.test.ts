import { describe, expect, it } from "vitest";
import { getOpenTelemetryAPI, withSpan } from "./pure.index";

// Covers the conditional-export variant served to `browser`/`edge` bundlers,
// mirroring the `./async_hooks` split. The real entry is covered by
// `./instrumentation.test.ts`. This suite asserts that the noop path mirrors
// the public shape of `./index` without loading `@opentelemetry/api`, and
// that `withSpan` still honors its contract: return the fn result, propagate
// sync throws, propagate async rejections.
//
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

	it("getOpenTelemetryAPI returns a noop shape", () => {
		const api = getOpenTelemetryAPI();
		expect(api.SpanStatusCode).toMatchObject({ UNSET: 0, OK: 1, ERROR: 2 });
		expect(typeof api.trace.getTracer).toBe("function");
		expect(
			(api.trace as { getActiveSpan?: () => unknown }).getActiveSpan?.(),
		).toBeUndefined();

		const span = api.trace.getTracer("t").startActiveSpan("noop", {}, (s) => s);
		expect(() => span.end()).not.toThrow();
		expect(() => span.setAttribute("k", "v")).not.toThrow();
	});

	it("does not reference `@opentelemetry/api` at runtime", async () => {
		const mod = await import("./pure.index");
		expect(mod.withSpan.toString()).not.toContain("opentelemetry");
		expect(mod.getOpenTelemetryAPI.toString()).not.toContain("opentelemetry");
	});
});
