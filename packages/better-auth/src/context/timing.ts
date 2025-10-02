import type { AuthContext } from "../init";

/**
 * Map to store durations of endpoint executions
 *
 * This is used to avoid timing attacks by making sure that
 * all endpoints take the same amount of time to execute.
 *
 * AuthContext -> [endpoint(string): duration(number)]
 *
 * Please note that we assume that AuthContext is a singleton for each auth instance.
 *
 * @internal
 */
const endpointTimingCache = new WeakMap<AuthContext, Map<string, number>>();

export function getDurationMap(authContext: AuthContext) {
	if (!endpointTimingCache.has(authContext)) {
		endpointTimingCache.set(authContext, new Map());
	}
	return endpointTimingCache.get(authContext)!;
}
