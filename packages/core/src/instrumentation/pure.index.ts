import type { OpenTelemetryAPI } from "./noop";
import { noopOpenTelemetryAPI } from "./noop";

/**
 * Noop variant of `./instrumentation` for runtimes where the dynamic
 * `import("@opentelemetry/api")` in `./api` can't resolve via the normal
 * ECMAScript dynamic-import semantics.
 *
 * Convex's V8 isolate rejects bare specifiers at resolve time and throws
 * synchronously from the `import()` expression itself rather than rejecting
 * the returned promise (see `get-convex/convex-backend`
 * `crates/isolate/src/request_scope.rs` `dynamic_import_callback`, which
 * returns `None` on resolver error; V8 treats that as a pending exception).
 * The `.catch()` in `getOpenTelemetryAPI` never runs and every `withSpan`
 * call surfaces an uncaught error.
 *
 * This module is wired through `package.json` conditional exports on the
 * `./instrumentation` subpath, matching the existing `./async_hooks` pattern.
 * The noop primitives live in `./noop` and are shared with `./api` so the
 * two entries can't drift.
 */

export * from "./attributes";

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
