import { wildcardMatch } from "./wildcard";

/**
 * Checks whether a path is allowed by the `enabledPaths` option,
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
		p.includes("*") ? wildcardMatch(p)(path) : p === path,
	);
}
