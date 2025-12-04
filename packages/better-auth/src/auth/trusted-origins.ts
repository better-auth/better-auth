import { getHost, getOrigin, getProtocol } from "../utils/url";
import { wildcardMatch } from "../utils/wildcard";

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

	if (pattern.includes("*")) {
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
