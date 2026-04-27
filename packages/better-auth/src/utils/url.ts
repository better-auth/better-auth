import type { BaseURLConfig, DynamicBaseURLConfig } from "@better-auth/core";
import { env } from "@better-auth/core/env";
import { BetterAuthError } from "@better-auth/core/error";
import { wildcardMatch } from "./wildcard";

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

function checkHasPath(url: string): boolean {
	try {
		const parsedUrl = new URL(url);
		const pathname = parsedUrl.pathname.replace(/\/+$/, "") || "/";
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

function withPath(url: string, path = "/api/auth") {
	assertHasProtocol(url);

	const hasPath = checkHasPath(url);
	if (hasPath) {
		return url;
	}

	const trimmedUrl = url.replace(/\/+$/, "");

	if (!path || path === "/") {
		return trimmedUrl;
	}

	path = path.startsWith("/") ? path : `/${path}`;
	return `${trimmedUrl}${path}`;
}

/**
 * RFC 1035 §2.3.4 max printable hostname (253) + ":65535" + slack.
 */
const MAX_HOST_HEADER_LENGTH = 260;

/**
 * @see https://datatracker.ietf.org/doc/html/rfc3986#section-3.2.2
 */
function splitHostPort(
	header: string,
): { host: string; port: string | null } | null {
	if (header.startsWith("[")) {
		const closing = header.indexOf("]");
		if (closing === -1) return null;

		const host = header.slice(0, closing + 1);
		const rest = header.slice(closing + 1);

		if (rest === "") return { host, port: null };
		if (!rest.startsWith(":")) return null;
		return { host, port: rest.slice(1) };
	}

	const lastColon = header.lastIndexOf(":");
	if (lastColon === -1) return { host: header, port: null };

	const host = header.slice(0, lastColon);
	const port = header.slice(lastColon + 1);

	if (host === "" || host.includes(":")) return null;
	return { host, port };
}

/**
 * @see https://datatracker.ietf.org/doc/html/rfc6335#section-6
 */
function isValidPort(port: string): boolean {
	if (!/^[0-9]{1,5}$/.test(port)) return false;

	const n = Number(port);
	return n >= 1 && n <= 65535;
}

const IPV4_SHAPE = /^[0-9]{1,3}(?:\.[0-9]{1,3}){3}$/;
const IPV4_OCTET = /^(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])$/;

/**
 * @see https://datatracker.ietf.org/doc/html/rfc3986#section-3.2.2
 */
function isValidIPv4(host: string): boolean {
	const octets = host.split(".");
	if (octets.length !== 4) return false;
	return octets.every((o) => IPV4_OCTET.test(o));
}

const IPV6_GROUP = /^[0-9a-fA-F]{1,4}$/;

/**
 * @see https://datatracker.ietf.org/doc/html/rfc4291#section-2.2
 */
function isValidIPv6(addr: string): boolean {
	if (addr === "::") return true;
	if (addr === "" || addr === ":") return false;

	const parts = addr.split("::");
	if (parts.length > 2) return false;

	const compressed = parts.length === 2;
	const [head = "", tail = ""] = parts;
	const headGroups = head ? head.split(":") : [];
	const tailGroups = compressed && tail ? tail.split(":") : [];
	const groups = headGroups.concat(tailGroups);

	if (groups.length === 0 || groups.some((g) => g === "")) return false;

	let extraGroups = 0;
	const last = groups[groups.length - 1] as string;
	if (last.includes(".")) {
		if (!isValidIPv4(last)) return false;
		groups.pop();
		extraGroups = 2;
	}

	if (!groups.every((g) => IPV6_GROUP.test(g))) return false;

	const total = groups.length + extraGroups;
	return compressed ? total < 8 : total === 8;
}

const REG_NAME_LABEL = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

/**
 * @see https://datatracker.ietf.org/doc/html/rfc1035#section-2.3.1
 * @see https://datatracker.ietf.org/doc/html/rfc1123#section-2
 */
function isValidRegName(host: string): boolean {
	if (host.length === 0 || host.length > 253) return false;

	const labels = host.split(".");
	return labels.every((label) => REG_NAME_LABEL.test(label));
}

function validateProxyHeader(header: string, type: "host" | "proto"): boolean {
	if (!header || header.trim() === "") {
		return false;
	}

	if (type === "proto") {
		return header === "http" || header === "https";
	}

	if (type === "host") {
		if (header.length > MAX_HOST_HEADER_LENGTH) return false;

		const parts = splitHostPort(header);
		if (!parts) return false;
		if (parts.port !== null && !isValidPort(parts.port)) return false;

		const { host } = parts;

		if (host.startsWith("[") && host.endsWith("]")) {
			return isValidIPv6(host.slice(1, -1));
		}

		// RFC 3986 §3.2.2 first-match-wins: only IPv4-shaped strings go to IPv4.
		if (IPV4_SHAPE.test(host)) return isValidIPv4(host);

		return isValidRegName(host);
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
 * Checks if the baseURL config is a dynamic config object
 */
export function isDynamicBaseURLConfig(
	config: BaseURLConfig | undefined,
): config is DynamicBaseURLConfig {
	return (
		typeof config === "object" &&
		config !== null &&
		"allowedHosts" in config &&
		Array.isArray(config.allowedHosts)
	);
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

	// Normalize: remove protocol if accidentally included, lowercase for case-insensitive matching
	const normalizedHost = host
		.replace(/^https?:\/\//, "")
		.split("/")[0]!
		.toLowerCase();
	const normalizedPattern = pattern
		.replace(/^https?:\/\//, "")
		.split("/")[0]!
		.toLowerCase();

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
 * Resolves the base URL from a dynamic config based on the incoming request.
 * Validates the derived host against the allowedHosts allowlist.
 *
 * @param config The dynamic base URL config
 * @param request The incoming request
 * @param basePath The base path to append
 * @returns The resolved base URL with path
 * @throws BetterAuthError if host is not in allowedHosts and no fallback is set
 */
export function resolveDynamicBaseURL(
	config: DynamicBaseURLConfig,
	source: Request | Headers,
	basePath: string,
	trustedProxyHeaders?: boolean,
): string {
	const host = getHostFromSource(source, trustedProxyHeaders);

	if (!host) {
		if (config.fallback) {
			return withPath(config.fallback, basePath);
		}
		throw new BetterAuthError(
			"Could not determine host from request headers. " +
				"Please provide a fallback URL in your baseURL config.",
		);
	}

	const isAllowed = config.allowedHosts.some((pattern) =>
		matchesHostPattern(host, pattern),
	);

	if (isAllowed) {
		const protocol = getProtocolFromSource(
			source,
			config.protocol,
			trustedProxyHeaders,
		);
		return withPath(`${protocol}://${host}`, basePath);
	}

	if (config.fallback) {
		return withPath(config.fallback, basePath);
	}

	throw new BetterAuthError(
		`Host "${host}" is not in the allowed hosts list. ` +
			`Allowed hosts: ${config.allowedHosts.join(", ")}. ` +
			`Add this host to your allowedHosts config or provide a fallback URL.`,
	);
}

/**
 * Resolves the base URL from any config type (static string or dynamic object).
 * This is the main entry point for base URL resolution.
 *
 * @param config The base URL config (string or object)
 * @param basePath The base path to append
 * @param request Optional request for dynamic resolution
 * @param loadEnv Whether to load from environment variables
 * @param trustedProxyHeaders Whether to trust proxy headers (for legacy behavior)
 * @returns The resolved base URL with path
 */
export function resolveBaseURL(
	config: BaseURLConfig | undefined,
	basePath: string,
	source?: Request | Headers,
	loadEnv?: boolean,
	trustedProxyHeaders?: boolean,
): string | undefined {
	if (isDynamicBaseURLConfig(config)) {
		if (source) {
			return resolveDynamicBaseURL(
				config,
				source,
				basePath,
				trustedProxyHeaders,
			);
		}
		if (config.fallback) {
			return withPath(config.fallback, basePath);
		}
		return getBaseURL(
			undefined,
			basePath,
			undefined,
			loadEnv,
			trustedProxyHeaders,
		);
	}

	// Static config path -> getBaseURL needs a full Request for URL parsing.
	const request = isRequestLike(source) ? source : undefined;
	if (typeof config === "string") {
		return getBaseURL(config, basePath, request, loadEnv, trustedProxyHeaders);
	}

	return getBaseURL(undefined, basePath, request, loadEnv, trustedProxyHeaders);
}
