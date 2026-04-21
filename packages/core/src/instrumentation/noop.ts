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

export function createNoopOpenTelemetryAPI(): OpenTelemetryAPI {
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
