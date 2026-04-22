/**
 * Noop variant of `./instrumentation` for runtimes where the dynamic
 * `import("@opentelemetry/api")` in `./api` throws synchronously instead of
 * rejecting its returned promise. Convex's V8 isolate is the reproducer: bare
 * specifiers are rejected at resolve time in `get-convex/convex-backend`
 * `crates/isolate/src/request_scope.rs`, so the `.catch()` in
 * `getOpenTelemetryAPI` never runs and every `withSpan` call surfaces an
 * uncaught error.
 *
 * Public surface must stay identical to `./index` (enforced by `pure.test.ts`).
 */

export * from "./attributes.js";

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
