import { env } from "@better-auth/core/env";
import { BetterAuthError } from "@better-auth/core/error";

const SLASH_CHAR_CODE = "/".charCodeAt(0);

/**
 * Minimal loopback check for dev scheme inference only. Reachable from
 * `client/config.ts` via `getBaseURL`, so we MUST NOT import the full
 * `@better-auth/core/utils/host` classifier here: its `utils/ip` dependency
 * on zod would leak into the client bundle (see `e2e/smoke/test/vite.spec.ts`).
 *
 * Server-side SSRF/loopback checks (oauth redirect matching, trusted-origin
 * resolution, electron fetch gate) continue to use the authoritative
 * `isLoopbackHost` from `@better-auth/core/utils/host`. This helper's only
 * job is picking `http` vs `https` for dev ergonomics.
 */
function isLoopbackForDevScheme(host: string): boolean {
	const hostname = host
		.replace(/:\d+$/, "")
		.replace(/^\[|\]$/g, "")
		.toLowerCase();
	return (
		hostname === "localhost" ||
		hostname.endsWith(".localhost") ||
		hostname === "::1" ||
		hostname.startsWith("127.")
	);
}

export function trimTrailingSlashes(value: string): string {
	let end = value.length;
	while (end > 0 && value.charCodeAt(end - 1) === SLASH_CHAR_CODE) {
		end--;
	}
	return end === value.length ? value : value.slice(0, end);
}

function checkHasPath(url: string): boolean {
	try {
		const parsedUrl = new URL(url);
		const pathname = trimTrailingSlashes(parsedUrl.pathname) || "/";
		return pathname !== "/";
	} catch {
		throw new BetterAuthError(
			`Invalid base URL: ${url}. Please provide a valid base URL.`,
		);
	}
}

function assertHasProtocol(url: string): void {
	try {
		const parsedUrl = new URL(url);
		if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
			throw new BetterAuthError(
				`Invalid base URL: ${url}. URL must include 'http://' or 'https://'`,
			);
		}
	} catch (error) {
		if (error instanceof BetterAuthError) {
			throw error;
		}
		throw new BetterAuthError(
			`Invalid base URL: ${url}. Please provide a valid base URL.`,
			{
				cause: error,
			},
		);
	}
}

export function withPath(url: string, path = "/api/auth") {
	assertHasProtocol(url);

	const hasPath = checkHasPath(url);
	if (hasPath) {
		return url;
	}

	const trimmedUrl = trimTrailingSlashes(url);

	if (!path || path === "/") {
		return trimmedUrl;
	}

	path = path.startsWith("/") ? path : `/${path}`;
	return `${trimmedUrl}${path}`;
}

function validateProxyHeader(header: string, type: "host" | "proto"): boolean {
	if (!header || header.trim() === "") {
		return false;
	}

	if (type === "proto") {
		// Only allow http and https protocols
		return header === "http" || header === "https";
	}

	if (type === "host") {
		const suspiciousPatterns = [
			/\.\./, // Path traversal
			/\0/, // Null bytes
			/[\s]/, // Whitespace (except legitimate spaces that should be trimmed)
			/^[.]/, // Starting with dot
			/[<>'"]/, // HTML/script injection characters
			/javascript:/i, // Protocol injection
			/file:/i, // File protocol
			/data:/i, // Data protocol
		];

		if (suspiciousPatterns.some((pattern) => pattern.test(header))) {
			return false;
		}

		// Basic hostname validation (allows localhost, IPs, and domains with ports)
		// This is a simple check, not exhaustive RFC validation
		const hostnameRegex =
			/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*(:[0-9]{1,5})?$/;

		// Also allow IPv4 addresses
		const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}(:[0-9]{1,5})?$/;

		// Also allow IPv6 addresses in brackets
		const ipv6Regex = /^\[[0-9a-fA-F:]+\](:[0-9]{1,5})?$/;

		// Allow localhost variations
		const localhostRegex = /^localhost(:[0-9]{1,5})?$/i;

		return (
			hostnameRegex.test(header) ||
			ipv4Regex.test(header) ||
			ipv6Regex.test(header) ||
			localhostRegex.test(header)
		);
	}

	return false;
}

export function getBaseURL(
	url?: string,
	path?: string,
	request?: Request,
	loadEnv?: boolean,
	trustedProxyHeaders?: boolean | undefined,
) {
	if (url) {
		return withPath(url, path);
	}

	if (loadEnv !== false) {
		const fromEnv =
			env.BETTER_AUTH_URL ||
			env.NEXT_PUBLIC_BETTER_AUTH_URL ||
			env.PUBLIC_BETTER_AUTH_URL ||
			env.NUXT_PUBLIC_BETTER_AUTH_URL ||
			env.NUXT_PUBLIC_AUTH_URL ||
			(env.BASE_URL !== "/" ? env.BASE_URL : undefined);

		if (fromEnv) {
			return withPath(fromEnv, path);
		}
	}

	const fromRequest = request?.headers.get("x-forwarded-host");
	const fromRequestProto = request?.headers.get("x-forwarded-proto");
	if (fromRequest && fromRequestProto && trustedProxyHeaders) {
		if (
			validateProxyHeader(fromRequestProto, "proto") &&
			validateProxyHeader(fromRequest, "host")
		) {
			try {
				return withPath(`${fromRequestProto}://${fromRequest}`, path);
			} catch (_error) {}
		}
	}

	if (request) {
		const url = getOrigin(request.url);
		if (!url) {
			throw new BetterAuthError(
				"Could not get origin from request. Please provide a valid base URL.",
			);
		}
		return withPath(url, path);
	}

	if (typeof window !== "undefined" && window.location) {
		return withPath(window.location.origin, path);
	}
	return undefined;
}

export function getOrigin(url: string) {
	try {
		const parsedUrl = new URL(url);
		// For custom URL schemes (like exp://), the origin property returns the string "null"
		// instead of null. We need to handle this case and return null so the fallback logic works.
		return parsedUrl.origin === "null" ? null : parsedUrl.origin;
	} catch {
		return null;
	}
}

export function getProtocol(url: string) {
	try {
		const parsedUrl = new URL(url);
		return parsedUrl.protocol;
	} catch {
		return null;
	}
}

export function getHost(url: string) {
	try {
		const parsedUrl = new URL(url);
		return parsedUrl.host;
	} catch {
		return null;
	}
}

/**
 * Check if a value is a `Request`
 * - `instanceof`: works for native Request instances
 * - `toString`: handles where instanceof check fails but the object is still a
 *   valid Request (e.g. cross-realm, polyfills). Paired with a shape check so
 *   an object that only spoofs `Symbol.toStringTag` without the real shape is
 *   rejected before downstream code tries to read `.headers` / `.url`.
 *
 * @param value The value to check
 * @returns `true` if the value is a Request instance
 */
export function isRequestLike(value: unknown): value is Request {
	if (value instanceof Request) return true;
	if (
		typeof value !== "object" ||
		value === null ||
		Object.prototype.toString.call(value) !== "[object Request]"
	) {
		return false;
	}
	const v = value as { url?: unknown; headers?: unknown };
	return (
		typeof v.url === "string" &&
		typeof v.headers === "object" &&
		v.headers !== null &&
		typeof (v.headers as { get?: unknown }).get === "function"
	);
}

/**
 * Extracts the host from a `Request` or `Headers`.
 * Honors `x-forwarded-host` only when `trustedProxyHeaders` is enabled,
 * then falls back to the `host` header and finally the request URL.
 */
export function getHostFromSource(
	source: Request | Headers,
	trustedProxyHeaders?: boolean,
): string | null {
	const headers = isRequestLike(source) ? source.headers : source;

	if (trustedProxyHeaders) {
		const forwardedHost = headers.get("x-forwarded-host");
		if (forwardedHost && validateProxyHeader(forwardedHost, "host")) {
			return forwardedHost;
		}
	}

	const host = headers.get("host");
	if (host && validateProxyHeader(host, "host")) {
		return host;
	}

	if (isRequestLike(source)) {
		try {
			const url = new URL(source.url);
			return url.host;
		} catch {
			return null;
		}
	}

	return null;
}

/**
 * Extracts the protocol from a `Request` or `Headers`.
 * Honors `x-forwarded-proto` only when `trustedProxyHeaders` is enabled,
 * then falls back to the request URL, then to "https".
 */
export function getProtocolFromSource(
	source: Request | Headers,
	configProtocol?: "http" | "https" | "auto" | undefined,
	trustedProxyHeaders?: boolean,
): "http" | "https" {
	if (configProtocol === "http" || configProtocol === "https") {
		return configProtocol;
	}

	const headers = isRequestLike(source) ? source.headers : source;

	if (trustedProxyHeaders) {
		const forwardedProto = headers.get("x-forwarded-proto");
		if (forwardedProto && validateProxyHeader(forwardedProto, "proto")) {
			return forwardedProto as "http" | "https";
		}
	}

	if (isRequestLike(source)) {
		try {
			const url = new URL(source.url);
			if (url.protocol === "http:" || url.protocol === "https:") {
				return url.protocol.slice(0, -1) as "http" | "https";
			}
		} catch {}
	}

	// Local dev: prefer `http` for loopback hosts so the headers-only path
	// doesn't diverge from the HTTP handler's URL-derived scheme.
	const host = getHostFromSource(source, trustedProxyHeaders);
	if (host && isLoopbackForDevScheme(host)) {
		return "http";
	}

	return "https";
}

/**
 * Builds the origin (`scheme://host`) for the host the request arrived on,
 * honoring `x-forwarded-*` only when proxy headers are trusted.
 */
export function getRequestOrigin(
	source: Request | Headers,
	configProtocol?: "http" | "https" | "auto" | undefined,
	trustedProxyHeaders?: boolean,
): string | null {
	const host = getHostFromSource(source, trustedProxyHeaders);
	if (!host) {
		return null;
	}
	const protocol = getProtocolFromSource(
		source,
		configProtocol,
		trustedProxyHeaders,
	);
	return `${protocol}://${host}`;
}
