import { APIError } from "better-call";
import { createAuthMiddleware } from "../call";
import { logger } from "../../utils";

/**
 * Middleware to validate callbackURL, redirectURL, currentURL and origin against trustedOrigins,
 */
export const originCheckMiddleware = createAuthMiddleware(async (ctx) => {
	if (
		ctx.context.options.advanced?.disableOriginCheck ||
		ctx.request?.method !== "POST"
	) {
		return;
	}
	const { body, query, context } = ctx;
	const originHeader =
		ctx.headers?.get("origin") || ctx.headers?.get("referer") || "";
	const callbackURL = body?.callbackURL;
	const redirectURL = body?.redirectTo;
	const currentURL = query?.currentURL;
	const trustedOrigins = context.trustedOrigins;

	const validateURL = (url: string | undefined, label: string) => {
		const isTrustedOrigin = trustedOrigins.some(
			(origin) =>
				url?.startsWith(origin) || (url?.startsWith("/") && label !== "origin"),
		);
		if (!isTrustedOrigin) {
			logger.error(`Invalid ${label}: ${url}`);
			logger.info(
				`If it's a valid URL, please add ${url} to trustedOrigins in your auth config\n`,
				`Current list of trustedOrigins: ${trustedOrigins}`,
			);
			throw new APIError("FORBIDDEN", { message: `Invalid ${label}` });
		}
	};

	callbackURL && validateURL(callbackURL, "callbackURL");
	redirectURL && validateURL(redirectURL, "redirectURL");
	currentURL && validateURL(currentURL, "currentURL");
	//origin must always be validated
	validateURL(originHeader, "origin");
});
