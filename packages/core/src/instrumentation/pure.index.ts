import type { Span, Tracer } from "@opentelemetry/api";

/**
 * Noop variant of `./instrumentation` for runtimes where the dynamic
 * `import("@opentelemetry/api")` in `./api` can't be relied on.
 *
 * Browsers and edge bundlers (`browser`, `edge` package.json conditions)
 * don't typically run a global `TracerProvider`, and some isolate runtimes
 * reject bare specifiers at resolve time and throw synchronously from the
 * `import()` expression itself rather than rejecting the returned promise.
 * In those cases the `.catch()` in `getOpenTelemetryAPI` never runs and
 * every call through `withSpan` surfaces an uncaught error.
 *
 * This module mirrors the public shape of `./index` without touching
 * `@opentelemetry/api` at all. Wired through `package.json` conditional
 * exports on the `./instrumentation` subpath, matching the existing
 * `./async_hooks` pattern.
 */

export * from "./attributes";

type OpenTelemetryAPI = Pick<
	typeof import("@opentelemetry/api"),
	"trace" | "SpanStatusCode"
>;

function createNoopSpan(): Span {
	const span = {
		end(): void {},
		setAttribute(_key: string, _value: unknown): void {},
		setStatus(_status: unknown): void {},
		recordException(_exception: unknown): void {},
		updateName(_name: string) {
			return span;
		},
	} as unknown as Span;
	return span;
}

function createNoopTracer(noopSpan: Span): Tracer {
	function startActiveSpan<F extends (span: Span) => unknown>(
		_name: string,
		_options: { attributes?: Record<string, string | number | boolean> },
		fn: F,
	): ReturnType<F> {
		return fn(noopSpan) as ReturnType<F>;
	}
	return { startActiveSpan } as Tracer;
}

function createNoopTraceAPI() {
	const noopTracer = createNoopTracer(createNoopSpan());
	return {
		getTracer(_name?: string, _version?: string) {
			return noopTracer;
		},
		getActiveSpan(): Span | undefined {
			return undefined;
		},
	};
}

const noopOpenTelemetryAPI: OpenTelemetryAPI = {
	SpanStatusCode: {
		UNSET: 0,
		OK: 1,
		ERROR: 2,
	},
	trace: createNoopTraceAPI(),
} as OpenTelemetryAPI;

export function getOpenTelemetryAPI(): OpenTelemetryAPI {
	return noopOpenTelemetryAPI;
}

export function withSpan<T>(
	name: string,
	attributes: Record<string, string | number | boolean>,
	fn: () => T,
): T;
export function withSpan<T>(
	name: string,
	attributes: Record<string, string | number | boolean>,
	fn: () => Promise<T>,
): Promise<T>;
export function withSpan<T>(
	_name: string,
	_attributes: Record<string, string | number | boolean>,
	fn: () => T | Promise<T>,
): T | Promise<T> {
	return fn();
}
