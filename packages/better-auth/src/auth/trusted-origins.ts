import { getHost, getOrigin, getProtocol } from "../utils/url";
import { wildcardMatch } from "../utils/wildcard";

/**
 * Matches a hostname against a host pattern.
 * Supports wildcard patterns like `*.vercel.app` or `preview-*.myapp.com`.
 *
 * @param host The hostname to test (e.g., "myapp.com", "preview-123.vercel.app")
 * @param pattern The host pattern (e.g., "myapp.com", "*.vercel.app")
 * @returns {boolean} true if the host matches the pattern, false otherwise.
 *
 * @example
 * ```ts
 * matchesHostPattern("myapp.com", "myapp.com") // true
 * matchesHostPattern("preview-123.vercel.app", "*.vercel.app") // true
 * matchesHostPattern("preview-123.myapp.com", "preview-*.myapp.com") // true
 * matchesHostPattern("evil.com", "myapp.com") // false
 * ```
 */
export const matchesHostPattern = (host: string, pattern: string): boolean => {
	if (!host || !pattern) {
		return false;
	}

	// Normalize: remove protocol if accidentally included
	const normalizedHost = host.replace(/^https?:\/\//, "").split("/")[0]!;
	const normalizedPattern = pattern.replace(/^https?:\/\//, "").split("/")[0]!;

	// Check if pattern contains wildcard characters
	const hasWildcard =
		normalizedPattern.includes("*") || normalizedPattern.includes("?");

	if (hasWildcard) {
		return wildcardMatch(normalizedPattern)(normalizedHost);
	}

	// Exact match (case-insensitive for hostnames)
	return normalizedHost.toLowerCase() === normalizedPattern.toLowerCase();
};

/**
 * Matches the given url against an origin or origin pattern
 * See "options.trustedOrigins" for details of supported patterns
 *
 * @param url The url to test
 * @param pattern The origin pattern
 * @param [settings] Specify supported pattern matching settings
 * @returns {boolean} true if the URL matches the origin pattern, false otherwise.
 */
export const matchesOriginPattern = (
	url: string,
	pattern: string,
	settings?: { allowRelativePaths: boolean },
): boolean => {
	if (url.startsWith("/")) {
		if (settings?.allowRelativePaths) {
			return (
				url.startsWith("/") &&
				/^\/(?!\/|\\|%2f|%5c)[\w\-.\+/@]*(?:\?[\w\-.\+/=&%@]*)?$/.test(url)
			);
		}

		return false;
	}

	// Check if pattern contains wildcard characters (*, **, or ?)
	const hasWildcard = pattern.includes("*") || pattern.includes("?");
	if (hasWildcard) {
		// For protocol-specific wildcards, match the full origin
		if (pattern.includes("://")) {
			return wildcardMatch(pattern)(getOrigin(url) || url);
		}
		const host = getHost(url);
		if (!host) {
			return false;
		}
		// For host-only wildcards, match just the host
		return wildcardMatch(pattern)(host);
	}
	const protocol = getProtocol(url);
	return protocol === "http:" || protocol === "https:" || !protocol
		? pattern === getOrigin(url)
		: url.startsWith(pattern);
};
