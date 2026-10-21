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
import type { BetterAuthOptions } from "../types";
import { noopWithSpan as withSpan } from "./noop";

export * from "./attributes";
export { withSpan };

/**
 * Selects the span runner for an auth instance.
 */
export function createWithSpan(_options: BetterAuthOptions): typeof withSpan {
	return withSpan;
}
