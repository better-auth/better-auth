import { createAuthMiddleware } from "@better-auth/core/api";
import { logger } from "better-auth";
import { APIError } from "better-auth/api";
import type { SubscriptionOptions } from "./types";

export const referenceMiddleware = (
	subscriptionOptions: SubscriptionOptions,
	action:
		| "upgrade-subscription"
		| "list-subscription"
		| "cancel-subscription"
		| "restore-subscription"
		| "billing-portal",
) =>
	createAuthMiddleware(async (ctx) => {
		const session = ctx.context.session;
		if (!session) {
			throw new APIError("UNAUTHORIZED");
		}
		const referenceId =
			ctx.body?.referenceId || ctx.query?.referenceId || session.user.id;

		if (
			referenceId !== session.user.id &&
			!subscriptionOptions.authorizeReference
		) {
			logger.error(
				`Passing referenceId into a subscription action isn't allowed if subscription.authorizeReference isn't defined in your stripe plugin config.`,
			);
			throw new APIError("BAD_REQUEST", {
				message:
					"Reference id is not allowed. Read server logs for more details.",
			});
		}
		/**
		 * if referenceId is the same as the active session user's id
		 */
		const sameReference =
			ctx.query?.referenceId === session.user.id ||
			ctx.body?.referenceId === session.user.id;
		const isAuthorized =
			ctx.body?.referenceId || ctx.query?.referenceId
				? (await subscriptionOptions.authorizeReference?.(
						{
							user: session.user,
							session: session.session,
							referenceId,
							action,
						},
						ctx,
					)) || sameReference
				: true;
		if (!isAuthorized) {
			throw new APIError("UNAUTHORIZED", {
				message: "Unauthorized",
			});
		}
	});
