import { describe, expect, it } from "vitest";
import { noopOpenTelemetryAPI } from "./noop";

// @see https://github.com/better-auth/better-auth/issues/8765
describe("instrumentation noop", () => {
	it("exposes a SpanStatusCode enum matching @opentelemetry/api", () => {
		expect(noopOpenTelemetryAPI.SpanStatusCode).toMatchObject({
			UNSET: 0,
			OK: 1,
			ERROR: 2,
		});
	});

	it("exposes a trace API with getTracer and getActiveSpan", () => {
		expect(typeof noopOpenTelemetryAPI.trace.getTracer).toBe("function");
		expect(
			(
				noopOpenTelemetryAPI.trace as { getActiveSpan?: () => unknown }
			).getActiveSpan?.(),
		).toBeUndefined();
	});

	it("returns a span whose mutators are safe no-ops", () => {
		const span = noopOpenTelemetryAPI.trace
			.getTracer("t")
			.startActiveSpan("noop", {}, (s) => s);
		expect(() => span.end()).not.toThrow();
		expect(() => span.setAttribute("k", "v")).not.toThrow();
	});

	it("honors all three startActiveSpan overloads", () => {
		const tracer = noopOpenTelemetryAPI.trace.getTracer("t");

		// (name, fn)
		const r1 = tracer.startActiveSpan("two-arg", (s) => {
			expect(s).toBeDefined();
			return 1 as const;
		});
		expect(r1).toBe(1);

		// (name, options, fn)
		const r2 = tracer.startActiveSpan("three-arg", { attributes: {} }, (s) => {
			expect(s).toBeDefined();
			return 2 as const;
		});
		expect(r2).toBe(2);

		// (name, options, context, fn)
		const r3 = (
			tracer.startActiveSpan as unknown as (
				name: string,
				options: unknown,
				context: unknown,
				fn: (span: unknown) => unknown,
			) => unknown
		)("four-arg", {}, {}, (s) => {
			expect(s).toBeDefined();
			return 3 as const;
		});
		expect(r3).toBe(3);
	});
});
