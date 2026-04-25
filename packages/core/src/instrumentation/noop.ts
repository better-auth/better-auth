import type { Span, Tracer } from "@opentelemetry/api";

export type OpenTelemetryAPI = Pick<
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
	// OpenTelemetry `Tracer.startActiveSpan` has three overloads:
	//   (name, fn)
	//   (name, options, fn)
	//   (name, options, context, fn)
	// The callback is always the last argument; fish it out by arity so a
	// 2-arg call (options omitted) doesn't try to invoke `undefined`.
	function startActiveSpan<F extends (span: Span) => unknown>(
		_name: string,
		fn: F,
	): ReturnType<F>;
	function startActiveSpan<F extends (span: Span) => unknown>(
		_name: string,
		_options: { attributes?: Record<string, string | number | boolean> },
		fn: F,
	): ReturnType<F>;
	function startActiveSpan<F extends (span: Span) => unknown>(
		_name: string,
		_options: { attributes?: Record<string, string | number | boolean> },
		_context: unknown,
		fn: F,
	): ReturnType<F>;
	function startActiveSpan(_name: string, ...rest: Array<unknown>): unknown {
		const fn = rest[rest.length - 1] as (span: Span) => unknown;
		return fn(noopSpan);
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

function createNoopOpenTelemetryAPI(): OpenTelemetryAPI {
	return {
		SpanStatusCode: {
			UNSET: 0,
			OK: 1,
			ERROR: 2,
		},
		trace: createNoopTraceAPI(),
	} as OpenTelemetryAPI;
}

export const noopOpenTelemetryAPI: OpenTelemetryAPI =
	createNoopOpenTelemetryAPI();
