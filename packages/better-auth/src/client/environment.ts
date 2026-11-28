const kIsServer = Symbol.for("better-auth:is-server");

// Shared through globalThis so every bundled copy of the client sees the same override.
const registry = globalThis as Record<symbol, (() => boolean) | undefined>;

/**
 * Whether the client runs during server rendering, where it skips mount
 * fetches, polling and process-wide listeners. Defaults to a missing `window`.
 */
export function isServer(): boolean {
	const override = registry[kIsServer];
	if (override) return override();
	return typeof window === "undefined";
}

/**
 * Overrides server detection for runtimes without `window` that host a
 * long-lived client, such as the Electron main process.
 */
export function setIsServer(isServer: () => boolean) {
	registry[kIsServer] = isServer;
}
