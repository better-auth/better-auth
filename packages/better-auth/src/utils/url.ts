import { env } from "@better-auth/core/env";
import { BetterAuthError } from "@better-auth/core/error";

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
			String(error),
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

export function getBaseCallbackURL(
	baseCallbackURL?: string,
	baseURL?: string,
	loadEnv?: boolean,
) {
	if (baseCallbackURL) {
		return baseCallbackURL;
	}

	if (loadEnv !== false) {
		const fromEnv =
			env.BETTER_AUTH_CALLBACK_URL ||
			env.NEXT_PUBLIC_BETTER_AUTH_CALLBACK_URL ||
			env.PUBLIC_BETTER_AUTH_CALLBACK_URL ||
			env.NUXT_PUBLIC_BETTER_AUTH_CALLBACK_URL;

		if (fromEnv) {
			return fromEnv;
		}
	}

	if (baseURL) {
		try {
			return new URL(baseURL).origin;
		} catch {
			return baseURL;
		}
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
