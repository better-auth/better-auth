import { SpanStatusCode, trace } from "@opentelemetry/api";

const INSTRUMENTATION_SCOPE = "better-auth";
const INSTRUMENTATION_VERSION = import.meta.env?.BETTER_AUTH_VERSION ?? "1.0.0";

const tracer = trace.getTracer(INSTRUMENTATION_SCOPE, INSTRUMENTATION_VERSION);

/**
 * Creates a child span whose lifetime is bound to the execution of the given function
 *
 * @param name - The name of the span.
 * @param attributes - The attributes of the span.
 * @param fn - The function to execute within the span.
 * @returns The result of the function.
 */
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
	name: string,
	attributes: Record<string, string | number | boolean>,
	fn: () => T | Promise<T>,
): T | Promise<T> {
	return tracer.startActiveSpan(name, { attributes }, (span) => {
		try {
			const result = fn();
			if (result instanceof Promise) {
				return result
					.then((value) => {
						span.end();
						return value;
					})
					.catch((err) => {
						span.recordException(err);
						span.setStatus({
							code: SpanStatusCode.ERROR,
							message: String(err.message ?? err),
						});
						span.end();
						throw err;
					}) as Promise<T>;
			}
			span.end();
			return result;
		} catch (err) {
			span.recordException(err as Error);
			span.setStatus({
				code: SpanStatusCode.ERROR,
				message: String((err as Error)?.message ?? err),
			});
			span.end();
			throw err;
		}
	});
}
