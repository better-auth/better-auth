/**
 * Shared instrumentation scope identity.
 *
 * Kept in a dependency-free module so both the OTEL and pure (workerd/Convex)
 * entry points can export the same public surface without pulling in
 * `@opentelemetry/api`.
 */
export const INSTRUMENTATION_SCOPE = "better-auth";
export const INSTRUMENTATION_VERSION =
	import.meta.env?.BETTER_AUTH_VERSION ?? "1.0.0";
