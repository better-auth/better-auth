import type { Span, Tracer } from "@opentelemetry/api";

type OpenTelemetryAPI = Pick<
	typeof import("@opentelemetry/api"),
	"trace" | "SpanStatusCode"
>;

function createNoopSpan(): Span {
	return {
		end(): void {},
		setAttribute(_key: string, _value: unknown): void {},
		setStatus(_status: unknown): void {},
		recordException(_exception: unknown): void {},
		updateName(_name: string) {
			return this;
		},
	} as Span;
}

function createNoopTracer(noopSpanInstance: Span): Tracer {
	function startActiveSpan<F extends (span: Span) => unknown>(
		_name: string,
		_options: { attributes?: Record<string, string | number | boolean> },
		fn: F,
	): ReturnType<F> {
		return fn(noopSpanInstance) as ReturnType<F>;
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

const noopOpenTelemetryAPI = createNoopOpenTelemetryAPI();

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
