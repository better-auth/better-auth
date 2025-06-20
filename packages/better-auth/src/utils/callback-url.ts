import { APIError } from "better-call";
import { wildcardMatch } from "./wildcard";
import type { GenericEndpointContext } from "../types";

/**
 * Checks if the callbackURL is a valid URL and if it's in the trustedOrigins
 * to avoid open redirect attacks
 */
export const checkCallbackURL = (
	callbackURL: string,
	ctx: GenericEndpointContext,
) => {
	const trustedOrigins = ctx.context.trustedOrigins;
	const callbackOrigin = callbackURL ? new URL(callbackURL).origin : null;
	if (callbackOrigin) {
		const isTrusted = trustedOrigins.some((trustedOrigin) => {
			if (trustedOrigin.includes("*")) {
				return wildcardMatch(trustedOrigin, { separator: false })(
					callbackOrigin,
				);
			}
			return trustedOrigin === callbackOrigin;
		});

		if (!isTrusted) {
			throw new APIError("FORBIDDEN", {
				message: "Invalid callback URL",
			});
		}
	}
};
