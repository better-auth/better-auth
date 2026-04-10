import type { Span, Tracer } from "@opentelemetry/api";

type OpenTelemetryAPI = Pick<
	typeof import("@opentelemetry/api"),
	"trace" | "SpanStatusCode"
>;

class NoopSpan {
	end(): void {}
	setAttribute(_key: string, _value: unknown): void {}
	setStatus(_status: unknown): void {}
	recordException(_exception: unknown): void {}
}

const noopSpanInstance = new NoopSpan() as Span;

class NoopTracer {
	startActiveSpan<F extends (span: Span) => unknown>(
		_name: string,
		_options: { attributes?: Record<string, string | number | boolean> },
		fn: F,
	): ReturnType<F> {
		return fn(noopSpanInstance) as ReturnType<F>;
	}
}

const noopTracerSingleton = new NoopTracer() as Tracer;

class NoopTraceAPI {
	getTracer(_name?: string, _version?: string): Tracer {
		return noopTracerSingleton;
	}
}

class NoopOpenTelemetryAPI {
	readonly SpanStatusCode: OpenTelemetryAPI["SpanStatusCode"] = {
		UNSET: 0,
		OK: 1,
		ERROR: 2,
	};
	readonly trace = new NoopTraceAPI();
}

function createNoopOpenTelemetryApi(): OpenTelemetryAPI {
	return new NoopOpenTelemetryAPI() as OpenTelemetryAPI;
}

export const { trace, SpanStatusCode }: OpenTelemetryAPI = await import(
	"@opentelemetry/api"
)
	.then((mod) => mod as OpenTelemetryAPI)
	.catch(() => createNoopOpenTelemetryApi());
