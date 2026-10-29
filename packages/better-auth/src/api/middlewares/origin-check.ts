import { APIError } from "better-call";
import { createAuthMiddleware } from "../call";
import { wildcardMatch } from "../../utils/wildcard";
import { getHost, getOrigin, getProtocol } from "../../utils/url";
import type { GenericEndpointContext } from "../../types";

export const matchesPattern = (url: string, pattern: string): boolean => {
	if (url.startsWith("/")) {
		return false;
	}
	if (pattern.includes("*")) {
		const patternHost = pattern.includes("://") ? getHost(pattern) : pattern;
		return wildcardMatch(patternHost)(getHost(url));
	}

	const candidateProtocol = getProtocol(url);
	const patternProtocol = getProtocol(pattern);

	if (candidateProtocol === "http:" || candidateProtocol === "https:") {
		const candidateOrigin = getOrigin(url);
		const patternOrigin = getOrigin(pattern);
		return Boolean(
			candidateOrigin &&
				patternOrigin &&
				candidateOrigin !== "null" &&
				candidateOrigin === patternOrigin,
		);
	}

	if (candidateProtocol && patternProtocol) {
		if (candidateProtocol !== patternProtocol) {
			return false;
		}
		const patternHost = getHost(pattern);
		if (patternHost) {
			return getHost(url) === patternHost;
		}
		return true;
	}

	return false;
};

export const isTrustedURL = (
	url: string | undefined,
	label: string,
	trustedOrigins: string[],
): boolean => {
	if (!url) {
		return true;
	}
	return trustedOrigins.some(
		(origin) =>
			matchesPattern(url, origin) ||
			(url.startsWith("/") &&
				label !== "origin" &&
				/^\/(?!\/|\\|%2f|%5c)[\w\-.\+/@]*(?:\?[\w\-.\+/=&%@]*)?$/.test(url)),
	);
};

/**
 * A middleware to validate callbackURL and origin against
 * trustedOrigins.
 */
export const originCheckMiddleware = createAuthMiddleware(async (ctx) => {
	if (ctx.request?.method !== "POST" || !ctx.request) {
		return;
	}
	const { body, query, context } = ctx;
	const originHeader =
		ctx.headers?.get("origin") || ctx.headers?.get("referer") || "";
	const callbackURL = body?.callbackURL || query?.callbackURL;
	const redirectURL = body?.redirectTo;
	const errorCallbackURL = body?.errorCallbackURL;
	const newUserCallbackURL = body?.newUserCallbackURL;
	const trustedOrigins: string[] = Array.isArray(context.options.trustedOrigins)
		? context.trustedOrigins
		: [
				...context.trustedOrigins,
				...((await context.options.trustedOrigins?.(ctx.request)) || []),
			];
	const usesCookies = ctx.headers?.has("cookie");

	const validateURL = (url: string | undefined, label: string) => {
		if (!url) {
			return;
		}
		if (!isTrustedURL(url, label, trustedOrigins)) {
			ctx.context.logger.error(`Invalid ${label}: ${url}`);
			ctx.context.logger.info(
				`If it's a valid URL, please add ${url} to trustedOrigins in your auth config\n`,
				`Current list of trustedOrigins: ${trustedOrigins}`,
			);
			throw new APIError("FORBIDDEN", { message: `Invalid ${label}` });
		}
	};
	if (usesCookies && !ctx.context.options.advanced?.disableCSRFCheck) {
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

		const validateURL = (url: string | undefined, label: string) => {
			if (!url) {
				return;
			}
			if (!isTrustedURL(url, label, trustedOrigins)) {
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
