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
 * Reject raw ASCII controls.
 * URL parsing may silently strip or encode them.
 * @see https://infra.spec.whatwg.org/#control
 * @see https://url.spec.whatwg.org/#concept-basic-url-parser
 */
const ASCII_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

// Encode delimiters within a raw segment.
const PATH_SEGMENT_DELIMITERS = /[/?#]/g;

// Reject query, fragment, and backslash delimiters in a pathname.
const PATHNAME_DELIMITERS = /[?#\\]/;

function parseURLReference(input: string) {
	const fragmentIndex = input.indexOf("#");
	const beforeFragment =
		fragmentIndex === -1 ? input : input.slice(0, fragmentIndex);
	const hash = fragmentIndex === -1 ? "" : input.slice(fragmentIndex);
	const queryIndex = beforeFragment.indexOf("?");
	const base =
		queryIndex === -1 ? beforeFragment : beforeFragment.slice(0, queryIndex);
	const search = queryIndex === -1 ? "" : beforeFragment.slice(queryIndex);

	if (
		input.trim() !== input ||
		input.startsWith("//") ||
		base.includes("\\") ||
		ASCII_CONTROL_CHARACTERS.test(input)
	) {
		throw new TypeError("Expected an absolute or root-relative URL");
	}
	const relative = input === "" || input.startsWith("/");
	const parsed = new URL(input, relative ? URL_REFERENCE_ORIGIN : undefined);
	return { base, search, hash, scheme: relative ? "" : parsed.protocol };
}

function encodePathSegment(segment: string) {
	if (segment === "" || segment === "." || segment === "..") {
		throw new TypeError(
			"URL path segments must be nonempty and not dot segments",
		);
	}
	return encodeURI(segment).replace(
		PATH_SEGMENT_DELIMITERS,
		encodeURIComponent,
	);
}

/**
 * Appends a root-relative pathname, merging only the shared slash boundary.
 * Existing URL spelling, path structure, query, and fragment are preserved.
 * Dot segments are preserved; this function does not resolve them.
 * An empty base produces a root-relative URL. Path text is not re-encoded or
 * checked for URI syntax; callers must validate untrusted input.
 *
 * @throws TypeError if the URL is invalid or the path introduces another URL component.
 *
 * @example
 * const baseURL = "https://example.com/api/auth";
 * const tokenURL = appendURLPath(baseURL, "/oauth2/token");
 * // tokenURL === "https://example.com/api/auth/oauth2/token"
 */
export function appendURLPath(url: string, path: string): string {
	if (
		!path.startsWith("/") ||
		path.startsWith("//") ||
		PATHNAME_DELIMITERS.test(path) ||
		path.trim() !== path ||
		ASCII_CONTROL_CHARACTERS.test(path)
	) {
		throw new TypeError("Expected a root-relative pathname");
	}
	const { base, search, hash, scheme } = parseURLReference(url);

	// Avoid URL serialization, which changes host and port spelling.
	if (scheme && !base.startsWith("/", scheme.length)) {
		throw new TypeError("URL does not support path appending");
	}

	const pathnameStart = base.startsWith("//", scheme.length)
		? base.indexOf("/", scheme.length + 2)
		: scheme.length;
	const pathname = pathnameStart === -1 ? "" : base.slice(pathnameStart);
	const appendedPath = pathname.endsWith("/") ? path.slice(1) : path;
	return base + appendedPath + search + hash;
}

/**
 * Appends raw values as separately encoded, nonempty path segments.
 * An empty base URL produces a root-relative URL.
 *
 * @throws TypeError if a segment is empty, `.` or `..`, or the URL cannot accept a path.
 * @throws URIError if a segment contains a lone surrogate.
 *
 * @example
 * const baseURL = "https://example.com/api/auth";
 * const callbackURL = appendURLSegments(baseURL, "callback", "team/member");
 * // callbackURL === "https://example.com/api/auth/callback/team%2Fmember"
 */
export function appendURLSegments(
	url: string,
	segment: string,
	...segments: string[]
): string {
	const path = [segment, ...segments].map(encodePathSegment).join("/");
	return appendURLPath(url, `/${path}`);
}

/**
 * Appends query parameters before the fragment of an absolute or root-relative URL.
 * Preserves URL spelling and existing query text without parsing name-value pairs.
 *
 * This function only composes URLs. Callers must validate untrusted input.
 *
 * @throws TypeError if parsing fails or a relative input changes authority.
 */
export function appendQueryParams(
	url: string,
	params: URLSearchParams,
): string {
	if (!url) {
		throw new TypeError("Expected an absolute or root-relative URL");
	}
	const { base, search, hash } = parseURLReference(url);
	const query = params.toString();
	if (!query) {
		return url;
	}
	const prefix = search || "?";
	const separator = prefix === "?" || prefix.endsWith("&") ? "" : "&";
	return base + prefix + separator + query + hash;
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
