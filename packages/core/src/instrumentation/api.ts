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

const noopOpenTelemetryAPI = new NoopOpenTelemetryAPI() as OpenTelemetryAPI;

let openTelemetryAPIPromise: Promise<void> | undefined;
let openTelemetryAPI: OpenTelemetryAPI | undefined;

export function getOpenTelemetryAPI(): OpenTelemetryAPI {
	if (!openTelemetryAPIPromise) {
		openTelemetryAPIPromise = import("@opentelemetry/api")
			.then((mod) => {
				openTelemetryAPI = mod;
			})
			.catch(() => /* ignore failures */ undefined);
	}

	return openTelemetryAPI ?? noopOpenTelemetryAPI;
}
