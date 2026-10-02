import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { isSafeUrlScheme } from "@better-auth/core/utils/url";
import { trimTrailingSlashes } from "./url";

/**
 * How many times a pathname is percent-decoded before it is given up on.
 * Anything that still changes after this many passes is not a legitimate
 * link, so it is rejected instead of compared.
 */
const MAX_DECODE_PASSES = 5;

/**
 * Resolves `.` and `..` segments and drops empty ones (repeated slashes and a
 * trailing slash), as a server normalizing the path would.
 */
function collapseSegments(path: string): string {
	const segments: string[] = [];
	for (const segment of path.split("/")) {
		if (segment === "..") {
			segments.pop();
		} else if (segment !== "." && segment !== "") {
			segments.push(segment);
		}
	}
	return `/${segments.join("/")}`;
}

/**
 * Returns the pathname in the form a router that percent-decodes it would
 * match: decoded until stable, dot segments and repeated slashes collapsed,
 * no trailing slash, lowercase. `URL.pathname` alone keeps sequences such as
 * `%2D` as they are, so `/verify%2Demail` would not compare equal to
 * `/verify-email` even though a decoding server serves it as such.
 *
 * A malformed encoding in the URL itself, or one that never stabilizes,
 * returns `null`. A `%` that only appears after a decode pass, such as the one
 * `%25` decodes to, is just a literal character: decoding stops there.
 */
function canonicalPathname(pathname: string): string | null {
	let current = pathname;
	for (let pass = 0; pass < MAX_DECODE_PASSES; pass++) {
		let decoded: string;
		try {
			decoded = decodeURIComponent(current);
		} catch {
			return pass === 0 ? null : collapseSegments(current).toLowerCase();
		}
		// Collapse after every pass so dot segments that decoding just
		// produced (`%2f..%2f`) are resolved, as they would be on the server.
		const next = collapseSegments(decoded);
		if (next === collapseSegments(current)) {
			return next.toLowerCase();
		}
		current = next;
	}
	return null;
}

/**
 * Validates the `callbackURL` used as the emailed link in `"explicit"`
 * confirmation mode, where the link is the app's own page (with a token
 * appended) instead of one of Better Auth's own endpoints.
 *
 * The URL must be absolute, because it is emailed and a relative one cannot
 * be resolved by a mail client. It must not point back at one of the
 * state-changing `GET` callbacks that explicit mode exists to keep out of
 * reach of link prefetchers and scanners, however its path is encoded. And it
 * must not already carry a `token` query parameter, since the real token is
 * appended and a page reading the first one would pick the wrong value.
 * Whether it is a trusted origin is checked separately by the global origin
 * check, before the handler runs.
 *
 * Throws before any side effect, so callers should run it before creating
 * the verification token.
 *
 * @param baseURL - The resolved auth base URL (`ctx.context.baseURL`).
 * @param callbackURL - The `callbackURL` from the request.
 * @param blockedPaths - Auth endpoint paths (relative to the base path) that
 * the link must not target, e.g. `["/delete-user/callback"]`.
 * @returns The validated absolute URL.
 */
export function assertExplicitCallbackURL(
	baseURL: string,
	callbackURL: string | undefined,
	blockedPaths: string[],
): string {
	if (!callbackURL) {
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.CALLBACK_URL_REQUIRED);
	}
	let target: URL;
	try {
		target = new URL(callbackURL);
	} catch {
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_CALLBACK_URL);
	}
	if (!isSafeUrlScheme(callbackURL)) {
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_CALLBACK_URL);
	}
	for (const key of target.searchParams.keys()) {
		if (key.toLowerCase() === "token") {
			throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_CALLBACK_URL);
		}
	}
	const base = new URL(baseURL);
	if (target.origin === base.origin) {
		const targetPath = canonicalPathname(target.pathname);
		if (targetPath === null) {
			throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_CALLBACK_URL);
		}
		const basePath = trimTrailingSlashes(base.pathname);
		const blocked = blockedPaths.some(
			(path) => targetPath === `${basePath}${path}`.toLowerCase(),
		);
		if (blocked) {
			throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_CALLBACK_URL);
		}
	}
	return callbackURL;
}
