/**
 * Normalizes a request pathname by removing the basePath prefix and trailing slashes.
 * This is useful for matching paths against configured path lists.
 *
 * @param requestUrl - The full request URL
 * @param basePath - The base path of the auth API (e.g., "/api/auth")
 * @returns The normalized path without basePath prefix or trailing slashes,
 *          or "/" if URL parsing fails
 *
 * @example
 * normalizePathname("http://localhost:3000/api/auth/sso/saml2/callback/provider1", "/api/auth")
 * // Returns: "/sso/saml2/callback/provider1"
 *
 * normalizePathname("http://localhost:3000/sso/saml2/callback/provider1/", "/")
 * // Returns: "/sso/saml2/callback/provider1"
 */
export function normalizePathname(
	requestUrl: string,
	basePath: string,
): string {
	let pathname: string;
	try {
		pathname = new URL(requestUrl).pathname.replace(/\/+$/, "") || "/";
	} catch {
		return "/";
	}

	// Canonicalize the basePath the same way as the request pathname. A baseURL
	// with a trailing slash yields a basePath like "/api/auth/"; without this it
	// would never match the slash-stripped pathname and the prefix would leak
	// through to disabledPaths and rate-limit special-rule matching.
	const normalizedBasePath = basePath.replace(/\/+$/, "");

	if (normalizedBasePath === "") {
		return pathname;
	}

	// Check for exact match or proper path boundary (basePath followed by "/" or end)
	// This prevents "/api/auth" from matching "/api/authevil/..."
	if (pathname === normalizedBasePath) {
		return "/";
	}

	if (pathname.startsWith(normalizedBasePath + "/")) {
		return pathname.slice(normalizedBasePath.length).replace(/\/+$/, "") || "/";
	}

	return pathname;
}

const URL_REFERENCE_ORIGIN = "https://better-auth.invalid";

/**
 * Appends query parameters before the fragment of an absolute or root-relative URL.
 * Existing query text is retained without parsing it into name-value pairs.
 *
 * This function only composes URLs. Callers must validate untrusted input.
 *
 * @throws TypeError if parsing fails or a relative input changes authority.
 */
export function appendQueryParams(
	input: string,
	params: URLSearchParams,
): string {
	const relative = input.startsWith("/");
	const hasAuthorityPrefix = input.startsWith("//") || input.startsWith("/\\");
	if (hasAuthorityPrefix) {
		throw new TypeError("Expected an absolute or root-relative URL");
	}

	const parsedURL = relative
		? new URL(input, URL_REFERENCE_ORIGIN)
		: new URL(input);

	if (relative && parsedURL.origin !== URL_REFERENCE_ORIGIN) {
		throw new TypeError("Expected an absolute or root-relative URL");
	}

	const query = params.toString();
	if (!query) {
		return input;
	}

	const separator = parsedURL.search.endsWith("&") ? "" : "&";
	parsedURL.search = parsedURL.search
		? `${parsedURL.search}${separator}${query}`
		: query;

	return relative
		? parsedURL.href.slice(parsedURL.origin.length)
		: parsedURL.href;
}

/**
 * Schemes that execute or embed code when navigated to or accepted as a
 * redirect target. These are never safe as an OAuth `redirect_uri` or as a
 * client-side navigation target (`window.location.href`, `location.assign`, ...).
 */
export const DANGEROUS_URL_SCHEMES = ["javascript:", "data:", "vbscript:"];

/**
 * Returns `false` only when `value` is an absolute URL using a dangerous scheme
 * (`javascript:`, `data:`, `vbscript:`). Relative URLs (e.g. `/dashboard`) and
 * safe absolute schemes (`http`, `https`, custom app schemes such as
 * `myapp://`) return `true`.
 *
 * Use this to guard browser navigation sinks and any redirect target that may
 * originate from untrusted input. It is intentionally narrow: it blocks code
 * execution schemes without rejecting relative paths or mobile deep links.
 */
export function isSafeUrlScheme(value: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		// Relative URLs carry no scheme to abuse.
		return true;
	}
	return !DANGEROUS_URL_SCHEMES.includes(parsed.protocol);
}
