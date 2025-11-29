import { wildcardMatch } from "../../../utils/wildcard";

/**
 * Matches a requested redirect URI against a registered redirect URI pattern.
 * Supports wildcards in the host part (e.g., `https://*.example.com/callback`).
 *
 * @param registeredURI - The registered redirect URI pattern (may contain wildcards in host)
 * @param requestedURI - The requested redirect URI to validate
 * @returns `true` if the requested URI matches the registered pattern, `false` otherwise
 */
export function matchesRedirectURI(
	registeredURI: string,
	requestedURI: string,
): boolean {
	// Exact match (no wildcards) - fastest path
	if (registeredURI === requestedURI) {
		return true;
	}

	// If registered URI doesn't contain wildcards, no match
	if (!registeredURI.includes("*")) {
		return false;
	}

	try {
		// Parse both URLs
		const registeredURL = new URL(registeredURI);
		const requestedURL = new URL(requestedURI);

		// Protocol must match exactly
		if (registeredURL.protocol !== requestedURL.protocol) {
			return false;
		}

		// Port must match exactly (including default ports)
		// Normalize ports: empty string means default port (80 for http, 443 for https)
		const getNormalizedPort = (url: URL) => {
			if (url.port) {
				return url.port;
			}
			return url.protocol === "https:" ? "443" : "80";
		};
		const registeredPort = getNormalizedPort(registeredURL);
		const requestedPort = getNormalizedPort(requestedURL);
		if (registeredPort !== requestedPort) {
			return false;
		}

		// Path and search must match exactly
		if (registeredURL.pathname !== requestedURL.pathname) {
			return false;
		}
		if (registeredURL.search !== requestedURL.search) {
			return false;
		}

		// Host can have wildcards - use wildcardMatch utility
		const registeredHost = registeredURL.hostname;
		const requestedHost = requestedURL.hostname;

		// Use wildcardMatch with '.' as separator for domain matching
		const hostMatcher = wildcardMatch(registeredHost, ".");
		return hostMatcher(requestedHost);
	} catch (error) {
		// If URL parsing fails, fall back to exact match check
		// This handles edge cases where URLs might be malformed
		return false;
	}
}
