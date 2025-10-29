import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { APIError } from "better-call";
import { getHost, getOrigin, getProtocol } from "../../utils/url";
import { wildcardMatch } from "../../utils/wildcard";

/**
 * A middleware to validate callbackURL and origin against
 * trustedOrigins.
 */
export const originCheckMiddleware = createAuthMiddleware(async (ctx) => {
	if (ctx.request?.method !== "POST" || !ctx.request) {
		return;
	}
	const headers = ctx.request?.headers;
	const request = ctx.request;
	const { body, query, context } = ctx;
	/**
	 * We only allow requests with the x-auth-request header set to
	 * true or application/json content type. This is to prevent
	 * simple requests from being processed
	 */
	if (isSimpleRequest(headers) && !ctx.context.skipCSRFCheck) {
		throw new APIError("FORBIDDEN", { message: "Invalid request" });
	}
	const originHeader = headers?.get("origin") || headers?.get("referer") || "";
	const callbackURL = body?.callbackURL || query?.callbackURL;
	const redirectURL = body?.redirectTo;
	const errorCallbackURL = body?.errorCallbackURL;
	const newUserCallbackURL = body?.newUserCallbackURL;

	const trustedOrigins: string[] = Array.isArray(context.options.trustedOrigins)
		? context.trustedOrigins
		: [
				...context.trustedOrigins,
				...((await context.options.trustedOrigins?.(request)) || []),
			];
	const useCookies = headers?.has("cookie");

	const matchesPattern = (url: string, pattern: string): boolean => {
		if (url.startsWith("/")) {
			return false;
		}
		if (pattern.includes("*")) {
			// For protocol-specific wildcards, match the full origin
			if (pattern.includes("://")) {
				return wildcardMatch(pattern)(getOrigin(url) || url);
			}
			const host = getHost(url);
			if (!host) {
				return false;
			}
			return wildcardMatch(pattern)(host);
		}

		const protocol = getProtocol(url);
		return protocol === "http:" || protocol === "https:" || !protocol
			? pattern === getOrigin(url)
			: url.startsWith(pattern);
	};
	const validateURL = (url: string | undefined, label: string) => {
		if (!url) {
			return;
		}
		const isTrustedOrigin = trustedOrigins.some(
			(origin) =>
				matchesPattern(url, origin) ||
				(url?.startsWith("/") &&
					label !== "origin" &&
					/^\/(?!\/|\\|%2f|%5c)[\w\-.\+/@]*(?:\?[\w\-.\+/=&%@]*)?$/.test(url)),
		);
		if (!isTrustedOrigin) {
			ctx.context.logger.error(`Invalid ${label}: ${url}`);
			ctx.context.logger.info(
				`If it's a valid URL, please add ${url} to trustedOrigins in your auth config\n`,
				`Current list of trustedOrigins: ${trustedOrigins}`,
			);
			throw new APIError("FORBIDDEN", { message: `Invalid ${label}` });
		}
	};
	if (
		useCookies &&
		!ctx.context.skipCSRFCheck &&
		!ctx.context.skipOriginCheck
	) {
		if (!originHeader || originHeader === "null") {
			throw new APIError("FORBIDDEN", { message: "Missing or null Origin" });
		}
		validateURL(originHeader, "origin");
	}
	callbackURL && validateURL(callbackURL, "callbackURL");
	redirectURL && validateURL(redirectURL, "redirectURL");
	errorCallbackURL && validateURL(errorCallbackURL, "errorCallbackURL");
	newUserCallbackURL && validateURL(newUserCallbackURL, "newUserCallbackURL");
});

export const originCheck = (
	getValue: (ctx: GenericEndpointContext) => string | string[],
) =>
	createAuthMiddleware(async (ctx) => {
		if (!ctx.request) {
			return;
		}
		const { context } = ctx;
		const callbackURL = getValue(ctx);
		const trustedOrigins: string[] = Array.isArray(
			context.options.trustedOrigins,
		)
			? context.trustedOrigins
			: [
					...context.trustedOrigins,
					...((await context.options.trustedOrigins?.(ctx.request)) || []),
				];

		const matchesPattern = (url: string, pattern: string): boolean => {
			if (url.startsWith("/")) {
				return false;
			}
			if (pattern.includes("*")) {
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
			return protocol === "http:" || protocol === "https:" || !protocol
				? pattern === getOrigin(url)
				: url.startsWith(pattern);
		};

		const validateURL = (url: string | undefined, label: string) => {
			if (!url) {
				return;
			}
			const isTrustedOrigin = trustedOrigins.some(
				(origin) =>
					matchesPattern(url, origin) ||
					(url?.startsWith("/") &&
						label !== "origin" &&
						/^\/(?!\/|\\|%2f|%5c)[\w\-.\+/@]*(?:\?[\w\-.\+/=&%@]*)?$/.test(
							url,
						)),
			);
			if (!isTrustedOrigin) {
				ctx.context.logger.error(`Invalid ${label}: ${url}`);
				ctx.context.logger.info(
					`If it's a valid URL, please add ${url} to trustedOrigins in your auth config\n`,
					`Current list of trustedOrigins: ${trustedOrigins}`,
				);
				throw new APIError("FORBIDDEN", { message: `Invalid ${label}` });
			}
		};
		const callbacks = Array.isArray(callbackURL) ? callbackURL : [callbackURL];
		for (const url of callbacks) {
			validateURL(url, "callbackURL");
		}
	});

export function isSimpleRequest(headers: Headers) {
	const SIMPLE_HEADERS = [
		"accept",
		"accept-language",
		"content-language",
		"content-type",
	];
	const SIMPLE_CONTENT_TYPES = [
		"application/x-www-form-urlencoded",
		"multipart/form-data",
		"text/plain",
	];
	for (const [key, value] of headers.entries()) {
		if (!SIMPLE_HEADERS.includes(key.toLowerCase())) {
			return false; // has non-simple header
		}
		if (
			key.toLowerCase() === "content-type" &&
			!SIMPLE_CONTENT_TYPES.includes(
				value?.split(";")[0]?.trim()?.toLowerCase() || "",
			)
		) {
			return false;
		}
	}
	return true;
}
