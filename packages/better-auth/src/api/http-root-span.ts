/**
 * Tracks the provisional root HTTP spans created by the auth router handler.
 *
 * OpenTelemetry's `Span` API has no name/attribute getters, so dispatch cannot
 * inspect an active span to decide whether it is safe to rename. Instead the
 * router marks spans it owns, and {@link isHttpRootSpan} gates the rename.
 */
const httpRootSpans = new WeakSet<object>();

export function markHttpRootSpan(span: object): void {
	httpRootSpans.add(span);
}

export function isHttpRootSpan<T extends object>(
	span: T | undefined | null,
): span is T {
	return span != null && httpRootSpans.has(span);
}
