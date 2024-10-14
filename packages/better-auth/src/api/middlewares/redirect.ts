import { APIError } from "better-call";
import { createAuthMiddleware } from "../call";
import { logger } from "../../utils/logger";

/**
 * This middleware is used to validate the callbackURL and currentURL.
 * It checks if the callbackURL is a valid URL and if it's in the trustedOrigins
 * to avoid open redirect attacks.
 */
export const redirectURLMiddleware = createAuthMiddleware(async (ctx) => {
	const callbackURL =
		ctx.body?.callbackURL ||
		ctx.query?.callbackURL ||
		ctx.query?.redirectTo ||
		ctx.body?.redirectTo;
	const clientCurrentURL = ctx.headers?.get("referer");
	const currentURL =
		ctx.query?.currentURL || clientCurrentURL || ctx.context.baseURL;
	const trustedOrigins = ctx.context.trustedOrigins;

	if (callbackURL?.includes("http")) {
		const callbackOrigin = new URL(callbackURL).origin;
		if (!trustedOrigins.includes(callbackOrigin)) {
			logger.error("Invalid callback URL", {
				callbackURL,
				trustedOrigins,
			});
			throw new APIError("FORBIDDEN", {
				message: "Invalid callback URL",
			});
		}
	}
	if (currentURL !== ctx.context.baseURL) {
		const currentURLOrigin = new URL(currentURL).origin;
		if (!trustedOrigins.includes(currentURLOrigin)) {
			logger.error("Invalid current URL", {
				currentURL,
				trustedOrigins,
			});
			throw new APIError("FORBIDDEN", {
				message: "Invalid callback URL",
			});
		}
	}
});
