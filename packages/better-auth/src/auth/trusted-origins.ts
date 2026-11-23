import * as z from "zod";
import { getHost, getOrigin, getProtocol } from "../utils/url";
import { wildcardMatch } from "../utils/wildcard";

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/;
const RELATIVE_URL_PARSER_ORIGIN = "https://better-auth.invalid";
const ENCODED_PATH_SEPARATOR_PATTERN = /%2[fF]|%5[cC]/;
const IP_WILDCARD_HOST_PATTERN = /^(?=.*\d)[\d*?.]+$/;
const ipv4Schema = z.ipv4();

/**
 * A wildcard host made only of digits, dots and wildcards (`192.168.*.*`,
 * `10.*`) names an address range, so it admits only an IPv4 address. A plain
 * `*` would otherwise cross `.` and let `192.168.attacker.com` match. Other
 * hosts keep the documented subdomain matching.
 */
const isAllowedIPv4Host = (patternAuthority: string, authority: string) => {
	const [patternHost = ""] = patternAuthority.split(":");
	if (!IP_WILDCARD_HOST_PATTERN.test(patternHost)) {
		return true;
	}
	const [host = ""] = authority.split(":");
	return z.validate(ipv4Schema, host);
};

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
const parseCustomSchemeOrigin = (value: string, wildcardPattern = false) => {
	if (CONTROL_CHARACTER_PATTERN.test(value)) {
		return null;
	}

	const schemeEnd = value.indexOf(":");
	if (schemeEnd <= 0) {
		return null;
	}
	const scheme = value.slice(0, schemeEnd).toLowerCase();
	let rest = value.slice(schemeEnd + 1);
	let authority = "";
	if (rest.startsWith("//")) {
		rest = rest.slice(2);
		// In a pattern, "?" is a wildcard rather than a query delimiter.
		const authorityEnd = rest.search(wildcardPattern ? /[/#]/ : /[/?#]/);
		if (authorityEnd === -1) {
			authority = rest;
			rest = "";
		} else {
			authority = rest.slice(0, authorityEnd);
			rest = rest.slice(authorityEnd);
		}
	}
	const pathEnd = rest.search(wildcardPattern ? /#/ : /[?#]/);
	const path = normalizePath(pathEnd === -1 ? rest : rest.slice(0, pathEnd));
	return { scheme, authority: authority.toLowerCase(), path };
};
/**
 * Validates root-relative redirects against ambiguous browser and router parsing.
 *
 * @see https://www.rfc-editor.org/rfc/rfc3986.html#section-4.2
 * @see https://url.spec.whatwg.org/#concept-basic-url-parser
 */
const isSafeRelativeURL = (value: string): boolean => {
	if (
		!value.startsWith("/") ||
		value.startsWith("//") ||
		value.includes("\\") ||
		CONTROL_CHARACTER_PATTERN.test(value)
	) {
		return false;
	}

	const pathEnd = value.search(/[?#]/);
	const path = pathEnd === -1 ? value : value.slice(0, pathEnd);
	if (ENCODED_PATH_SEPARATOR_PATTERN.test(path)) {
		return false;
	}

	try {
		// Recheck authority after web-platform URL normalization.
		return (
			new URL(value, RELATIVE_URL_PARSER_ORIGIN).origin ===
			RELATIVE_URL_PARSER_ORIGIN
		);
	} catch {
		return false;
	}
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
		return settings?.allowRelativePaths === true && isSafeRelativeURL(url);
	}

	// Check if pattern contains wildcard characters (*, **, or ?)
	const hasWildcard = pattern.includes("*") || pattern.includes("?");
	if (hasWildcard && !pattern.includes("://")) {
		const host = getHost(url);
		if (!host) {
			return false;
		}
		// For host-only wildcards, match just the host
		return wildcardMatch(pattern)(host) && isAllowedIPv4Host(pattern, host);
	}
	const protocol = getProtocol(url);
	if (protocol === "http:" || protocol === "https:" || !protocol) {
		if (!hasWildcard) {
			return pattern === getOrigin(url);
		}
		// For protocol-specific wildcards, match the full origin. A URL without
		// one is never matched as a raw string.
		const origin = getOrigin(url);
		if (origin === null || !wildcardMatch(pattern)(origin)) {
			return false;
		}
		return isAllowedIPv4Host(
			pattern.slice(pattern.indexOf("://") + 3),
			origin.slice(origin.indexOf("://") + 3),
		);
	}
	// Custom schemes (e.g. myapp://, exp://). A pattern matches by scheme and,
	// when it pins a host, by exact authority, so "myapp://callback" is not
	// satisfied by "myapp://callback.attacker.tld". A host-less pattern
	// ("myapp://", "exp://", "myapp:/") trusts every host of the scheme, since
	// for custom schemes the OS-registered scheme is the trust boundary.
	const parsed = parseCustomSchemeOrigin(url);
	const parsedPattern = parseCustomSchemeOrigin(pattern, hasWildcard);
	if (!parsed || !parsedPattern || parsed.scheme !== parsedPattern.scheme) {
		return false;
	}
	if (hasWildcard) {
		// Userinfo is never part of an app origin. A wildcard must not reach
		// past it to match the real host.
		if (parsed.authority.includes("@")) {
			return false;
		}
		if (
			parsedPattern.authority &&
			!(
				wildcardMatch(parsedPattern.authority)(parsed.authority) &&
				isAllowedIPv4Host(parsedPattern.authority, parsed.authority)
			)
		) {
			return false;
		}
		return (
			!parsedPattern.path ||
			wildcardMatch(parsedPattern.path)(parsed.path || "/")
		);
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
