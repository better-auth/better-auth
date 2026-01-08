import type { InternalLogger } from "../env";

/**
 * Wraps a function to log a deprecation warning at once.
 */
export function deprecate<T extends (...args: any[]) => any>(
	fn: T,
	message: string,
	logger?: InternalLogger,
): T {
	let warned = false;

	return function (this: any, ...args: Parameters<T>): ReturnType<T> {
		if (!warned) {
			const warn = logger?.warn ?? console.warn;
			warn(`[Deprecation] ${message}`);
			warned = true;
		}
		return fn.apply(this, args);
	} as T;
}
