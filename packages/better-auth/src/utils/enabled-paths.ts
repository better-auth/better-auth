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

function splitPath(path: string) {
	return path.split("/").filter(Boolean);
}

/**
 * Checks whether some request path matches both an endpoint, whose `:param`
 * segments match any single segment, and a wildcard entry, whose `**`
 * segments match zero or more segments.
 */
function overlaps(endpoint: string[], entry: string[]): boolean {
	const [pattern, ...restEntry] = entry;
	if (pattern === undefined) {
		return endpoint.length === 0;
	}
	if (pattern === "**") {
		return (
			overlaps(endpoint, restEntry) ||
			(endpoint.length > 0 && overlaps(endpoint.slice(1), entry))
		);
	}
	const [segment, ...restEndpoint] = endpoint;
	if (segment === undefined) {
		return false;
	}
	return (
		(segment.startsWith(":") || getMatcher(pattern)(segment)) &&
		overlaps(restEndpoint, restEntry)
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
	const endpointSegments = splitPath(endpointPath);
	return enabledPaths.some((p) =>
		p.includes("*")
			? overlaps(endpointSegments, splitPath(p))
			: matchesEndpoint(p),
	);
}
