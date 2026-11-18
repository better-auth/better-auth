/**
 * Whether the client runs during server rendering, where it skips mount
 * fetches, polling and process-wide listeners.
 */
export function isServer(): boolean {
	return typeof window === "undefined";
}
