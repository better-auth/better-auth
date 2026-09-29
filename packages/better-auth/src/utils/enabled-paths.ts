import { wildcardMatch } from "./wildcard";

const matchers = new Map<string, (path: string) => boolean>();

function getMatcher(pattern: string) {
	let matcher = matchers.get(pattern);
	if (!matcher) {
		matcher = wildcardMatch(pattern);
		matchers.set(pattern, matcher);
	}
	return matcher;
}

/**
 * Checks whether a request path is allowed by the `enabledPaths` option,
 * using the same matching as rate-limit custom rules.
 */
export function isPathEnabled(
	path: string,
	enabledPaths: string[] | undefined,
): boolean {
	if (!enabledPaths) {
		return true;
	}
	return enabledPaths.some((p) =>
		p.includes("*") ? getMatcher(p)(path) : p === path,
	);
}

/**
 * Checks whether an endpoint is reachable under the `enabledPaths` option.
 *
 * Entries are matched against request paths, so an entry such as
 * `/callback/google` never equals the `/callback/:id` route it enables.
 * Route parameters are treated as wildcards to cover that case.
 */
export function isEndpointEnabled(
	endpointPath: string,
	enabledPaths: string[] | undefined,
): boolean {
	if (!enabledPaths || isPathEnabled(endpointPath, enabledPaths)) {
		return true;
	}
	if (!endpointPath.includes(":")) {
		return false;
	}
	const matchesEndpoint = getMatcher(endpointPath.replace(/:[^/]+/g, "*"));
	return enabledPaths.some((p) => matchesEndpoint(p));
}
