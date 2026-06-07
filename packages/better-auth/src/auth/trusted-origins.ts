import { getHost, getOrigin, getProtocol } from "../utils/url";
import { wildcardMatch } from "../utils/wildcard";

/**
 * Resolves `.` and `..` segments in a path after percent-decoding so a
 * path-pinned pattern cannot be bypassed with traversal: e.g.
 * `myapp://host/cb/../evil` must not satisfy pattern `myapp://host/cb`.
 * Returns "" for an empty or root path.
 */
const normalizePath = (path: string): string => {
	let decoded = path;
	try {
		decoded = decodeURIComponent(path);
	} catch {
		// Not valid percent-encoding; fall back to the raw path.
	}
	const segments: string[] = [];
	for (const segment of decoded.split("/")) {
		if (segment === "..") {
			segments.pop();
		} else if (segment !== "." && segment !== "") {
			segments.push(segment);
		}
	}
	return segments.length > 0 ? `/${segments.join("/")}` : "";
};

/**
 * Splits a custom-scheme origin into its scheme, authority and path using
 * plain string operations.
 *
 * `new URL()` is deliberately avoided here: its parsing of non-special schemes
 * (e.g. `myapp://`, `exp://`) is not consistent across the runtimes Better Auth
 * targets (Node, Bun, Deno, Cloudflare Workers), and the result of an origin
 * check must not depend on which engine extracts the authority.
 *
 * Scheme and authority are lower-cased (matching how a URL canonicalizes its
 * host); the path is percent-decoded and resolved so traversal cannot bypass
 * a path-pinned pattern.
 */
const parseCustomSchemeOrigin = (value: string) => {
	const schemeEnd = value.indexOf(":");
	if (schemeEnd <= 0) {
		return null;
	}
	const scheme = value.slice(0, schemeEnd).toLowerCase();
	let rest = value.slice(schemeEnd + 1);
	let authority = "";
	if (rest.startsWith("//")) {
		rest = rest.slice(2);
		// The authority ends at the first "/", "?" or "#" (RFC 3986); the
		// remainder is the path, with any query/fragment stripped below.
		const authorityEnd = rest.search(/[/?#]/);
		if (authorityEnd === -1) {
			authority = rest;
			rest = "";
		} else {
			authority = rest.slice(0, authorityEnd);
			rest = rest.slice(authorityEnd);
		}
	}
	const path = normalizePath(rest.replace(/[?#].*$/, ""));
	return { scheme, authority: authority.toLowerCase(), path };
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
	if (protocol === "http:" || protocol === "https:" || !protocol) {
		return pattern === getOrigin(url);
	}
	// Custom schemes (e.g. myapp://, exp://). A pattern matches by scheme and,
	// when it pins a host, by exact authority, so "myapp://callback" is not
	// satisfied by "myapp://callback.attacker.tld". A host-less pattern
	// ("myapp://", "exp://", "myapp:/") trusts every host of the scheme, since
	// for custom schemes the OS-registered scheme is the trust boundary.
	const parsed = parseCustomSchemeOrigin(url);
	const parsedPattern = parseCustomSchemeOrigin(pattern);
	if (!parsed || !parsedPattern || parsed.scheme !== parsedPattern.scheme) {
		return false;
	}
	if (parsedPattern.authority && parsed.authority !== parsedPattern.authority) {
		return false;
	}
	// A pattern without a path trusts every path; otherwise the url path must
	// equal the pattern path or be nested beneath it.
	if (!parsedPattern.path) {
		return true;
	}
	return (
		parsed.path === parsedPattern.path ||
		parsed.path.startsWith(`${parsedPattern.path}/`)
	);
};
