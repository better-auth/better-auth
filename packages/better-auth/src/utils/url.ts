import type {
	Awaitable,
	BaseURLConfig,
	DynamicBaseURLConfig,
} from "@better-auth/core";
import { env } from "@better-auth/core/env";
import { BetterAuthError } from "@better-auth/core/error";
import { wildcardMatch } from "./wildcard";

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
 * Checks if the baseURL config is a per-request function
 */
export function isFunctionBaseURLConfig(
	config: BaseURLConfig | undefined,
): config is (request: Request) => Awaitable<string> {
	return typeof config === "function";
}

/**
 * True for any config that requires per-request resolution
 * (either allowedHosts object or function).
 */
export function isPerRequestBaseURL(
	config: BaseURLConfig | undefined,
): config is DynamicBaseURLConfig | ((request: Request) => Awaitable<string>) {
	return isDynamicBaseURLConfig(config) || isFunctionBaseURLConfig(config);
}

/**
 * Resolves the base URL by calling a user-provided function.
 *
 * @param fn The baseURL function from config
 * @param request The incoming request
 * @param basePath The base path to append
 * @returns The resolved base URL with path
 * @throws BetterAuthError if the function returns a falsy value
 */
export async function resolveFunctionBaseURL(
	fn: (request: Request) => Awaitable<string>,
	request: Request,
	basePath: string,
): Promise<string> {
	let url: string;
	try {
		url = await fn(request);
	} catch (error) {
		throw new BetterAuthError(
			"baseURL function threw an error. " +
				"Ensure your function returns a valid URL.",
			{ cause: error },
		);
	}
	if (!url) {
		throw new BetterAuthError(
			"baseURL function returned an empty value. " +
				"Return a valid URL (e.g., 'https://myapp.com').",
		);
	}
	return withPath(url, basePath);
}

/**
 * Extracts the host from the request headers.
 * Tries x-forwarded-host first (for proxy setups), then falls back to host header.
 *
 * @param request The incoming request
 * @returns The host string or null if not found
 */
export function getHostFromRequest(request: Request): string | null {
	const forwardedHost = request.headers.get("x-forwarded-host");
	if (forwardedHost && validateProxyHeader(forwardedHost, "host")) {
		return forwardedHost;
	}

	const host = request.headers.get("host");
	if (host && validateProxyHeader(host, "host")) {
		return host;
	}

	try {
		const url = new URL(request.url);
		return url.host;
	} catch {
		return null;
	}
}

/**
 * Extracts the protocol from the request headers.
 * Tries x-forwarded-proto first (for proxy setups), then infers from request URL.
 *
 * @param request The incoming request
 * @param configProtocol Protocol override from config
 * @returns The protocol ("http" or "https")
 */
export function getProtocolFromRequest(
	request: Request,
	configProtocol?: "http" | "https" | "auto" | undefined,
): "http" | "https" {
	if (configProtocol === "http" || configProtocol === "https") {
		return configProtocol;
	}

	const forwardedProto = request.headers.get("x-forwarded-proto");
	if (forwardedProto && validateProxyHeader(forwardedProto, "proto")) {
		return forwardedProto as "http" | "https";
	}

	try {
		const url = new URL(request.url);
		if (url.protocol === "http:" || url.protocol === "https:") {
			return url.protocol.slice(0, -1) as "http" | "https";
		}
	} catch {}

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
	request: Request,
	basePath: string,
): string {
	const host = getHostFromRequest(request);

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
		const protocol = getProtocolFromRequest(request, config.protocol);
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
	request?: Request,
	loadEnv?: boolean,
	trustedProxyHeaders?: boolean,
): string | undefined {
	if (isDynamicBaseURLConfig(config)) {
		if (request) {
			return resolveDynamicBaseURL(config, request, basePath);
		}
		if (config.fallback) {
			return withPath(config.fallback, basePath);
		}
		return getBaseURL(
			undefined,
			basePath,
			request,
			loadEnv,
			trustedProxyHeaders,
		);
	}

	if (typeof config === "string") {
		return getBaseURL(config, basePath, request, loadEnv, trustedProxyHeaders);
	}

	return getBaseURL(undefined, basePath, request, loadEnv, trustedProxyHeaders);
}
