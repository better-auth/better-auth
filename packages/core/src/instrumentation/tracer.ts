import type { Span } from "@opentelemetry/api";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { ATTR_HTTP_RESPONSE_STATUS_CODE } from "./attributes";

const INSTRUMENTATION_SCOPE = "better-auth";
const INSTRUMENTATION_VERSION = import.meta.env?.BETTER_AUTH_VERSION ?? "1.0.0";

const tracer = trace.getTracer(INSTRUMENTATION_SCOPE, INSTRUMENTATION_VERSION);

/**
 * Better-auth uses `throw ctx.redirect(url)` for flow control (e.g. OAuth
 * callbacks). These are APIErrors with 3xx status codes and should not be
 * recorded as span errors.
 */
function isRedirectError(err: unknown): boolean {
	if (
		err != null &&
		typeof err === "object" &&
		"name" in err &&
		(err as { name: string }).name === "APIError" &&
		"statusCode" in err
	) {
		const status = (err as { statusCode: number }).statusCode;
		return status >= 300 && status < 400;
	}
	return false;
}

function endSpanWithError(span: Span, err: unknown) {
	if (isRedirectError(err)) {
		span.setAttribute(
			ATTR_HTTP_RESPONSE_STATUS_CODE,
			(err as { statusCode: number }).statusCode,
		);
		span.setStatus({ code: SpanStatusCode.OK });
	} else {
		span.recordException(err as Error);
		span.setStatus({
			code: SpanStatusCode.ERROR,
			message: String((err as Error)?.message ?? err),
		});
	}
	span.end();
}

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
						endSpanWithError(span, err);
						throw err;
					}) as Promise<T>;
			}
			span.end();
			return result;
		} catch (err) {
			endSpanWithError(span, err);
			throw err;
		}
	});
}
