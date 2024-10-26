import { APIError } from "better-call";
import { createAuthMiddleware } from "../call";
import { logger } from "../../utils/logger";

/**
 * Middleware to validate callbackURL and currentURL against trustedOrigins,
 * preventing open redirect attacks.
 */
export const redirectURLMiddleware = createAuthMiddleware(async (ctx) => {
	const { body, query, context } = ctx;

	const callbackURL =
		body?.callbackURL ||
		query?.callbackURL ||
		query?.redirectTo ||
		body?.redirectTo;
	const currentURL = query?.currentURL;
	const trustedOrigins = context.trustedOrigins;

	const validateURL = (url: string | undefined, label: string) => {
		if (url?.startsWith("http")) {
			const isTrustedOrigin = trustedOrigins.some((origin) =>
				url.startsWith(origin),
			);
			if (!isTrustedOrigin) {
				logger.error(`Invalid ${label}`, { [label]: url, trustedOrigins });
				throw new APIError("FORBIDDEN", { message: `Invalid ${label}` });
			}
		}
	};

	validateURL(callbackURL, "callbackURL");
	validateURL(currentURL, "currentURL");
});
