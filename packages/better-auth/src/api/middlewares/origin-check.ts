import { APIError } from "better-call";
import { createAuthMiddleware } from "../call";
import { wildcardMatch } from "../../utils/wildcard";
import { getHost } from "../../utils/url";

/**
 * Middleware to validate callbackURL, redirectURL, errorURL, and origin against trustedOrigins.
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
	const trustedOrigins = context.trustedOrigins;
	const usesCookies = ctx.headers?.has("cookie");

	if (ctx.context.options.advanced?.customOriginChecker) {
		if (callbackURL) {
			const result = ctx.context.options.advanced.customOriginChecker(
				{
					url: callbackURL,
					label: "callbackURL",
				},
				ctx.request,
			);
			if (!result) {
				throw new APIError("FORBIDDEN", { message: "invalid callbackURL" });
			}
		}
		if (redirectURL) {
			const result = ctx.context.options.advanced.customOriginChecker(
				{
					url: redirectURL,
					label: "callbackURL",
				},
				ctx.request,
			);
			if (!result) {
				throw new APIError("FORBIDDEN", { message: "invalid callbackURL" });
			}
		}
		if (origin) {
			const result = ctx.context.options.advanced.customOriginChecker(
				{
					url: origin,
					label: "origin",
				},
				ctx.request,
			);
			if (!result) {
				throw new APIError("FORBIDDEN", { message: "invalid callbackURL" });
			}
		}
		return;
	}

	const matchesPattern = (url: string, pattern: string) => {
		if (url.startsWith("/")) {
			return false;
		}
		const host = getHost(url);
		if (pattern.includes("*")) {
			return wildcardMatch(pattern)(host);
		}
		return url.startsWith(pattern);
	};

	const validateURL = (url: string, label: string) => {
		if (!url) {
			return;
		}

		const isTrustedOrigin = trustedOrigins.some(
			(origin) =>
				matchesPattern(url, origin) ||
				(url.startsWith("/") && label !== "origin" && !url.includes(":")),
		);

		if (!isTrustedOrigin) {
			const errorMessage = `Invalid ${label}: ${url}`;
			ctx.context.logger.error(errorMessage);
			ctx.context.logger.info(
				`If it's a valid URL, please add ${url} to trustedOrigins in your auth config\n`,
				`Current list of trustedOrigins: ${trustedOrigins}`,
			);
			throw new APIError("FORBIDDEN", { message: errorMessage });
		}
	};

	if (usesCookies) {
		if (!originHeader) {
			throw new APIError("FORBIDDEN", {
				message: "origin header missing",
			});
		}
		validateURL(originHeader, "origin");
	}

	[
		{ url: callbackURL, label: "callbackURL" },
		{ url: redirectURL, label: "redirectURL" },
	].forEach(({ url, label }) => validateURL(url, label));
});
