import { createAuthMiddleware } from "@better-auth/core/api";
import { APIError, sessionMiddleware } from "better-auth/api";
import { STRIPE_ERROR_CODES } from "./error-codes";
import type {
	AuthorizeReferenceAction,
	CustomerType,
	StripeCtxSession,
	SubscriptionOptions,
} from "./types";

export const stripeSessionMiddleware = createAuthMiddleware(
	{
		use: [sessionMiddleware],
	},
	async (ctx) => {
		const session = ctx.context.session as StripeCtxSession;
		return {
			session,
		};
	},
);

export const referenceMiddleware = (
	subscriptionOptions: SubscriptionOptions,
	action: AuthorizeReferenceAction,
) =>
	createAuthMiddleware(async (ctx) => {
		const ctxSession = ctx.context.session as StripeCtxSession;
		if (!ctxSession) {
			throw new APIError("UNAUTHORIZED", {
				message: STRIPE_ERROR_CODES.UNAUTHORIZED,
			});
		}

		const customerType: CustomerType =
			ctx.body?.customerType || ctx.query?.customerType;
		const explicitReferenceId = ctx.body?.referenceId || ctx.query?.referenceId;

		if (customerType === "organization") {
			// Organization subscriptions always require authorizeReference
			if (!subscriptionOptions.authorizeReference) {
				ctx.context.logger.error(
					`Organization subscriptions require authorizeReference to be defined in your stripe plugin config.`,
				);
				throw new APIError("BAD_REQUEST", {
					message: STRIPE_ERROR_CODES.AUTHORIZE_REFERENCE_REQUIRED,
				});
			}

			const referenceId =
				explicitReferenceId || ctxSession.session.activeOrganizationId;
			if (!referenceId) {
				throw new APIError("BAD_REQUEST", {
					message: STRIPE_ERROR_CODES.ORGANIZATION_REFERENCE_ID_REQUIRED,
				});
			}
			const isAuthorized = await subscriptionOptions.authorizeReference(
				{
					user: ctxSession.user,
					session: ctxSession.session,
					referenceId,
					action,
				},
				ctx,
			);
			if (!isAuthorized) {
				throw new APIError("UNAUTHORIZED", {
					message: STRIPE_ERROR_CODES.UNAUTHORIZED,
				});
			}
			return;
		}

		// User subscriptions - pass if no explicit referenceId
		if (!explicitReferenceId) {
			return;
		}

		// Pass if referenceId is user id
		if (explicitReferenceId === ctxSession.user.id) {
			return;
		}

		if (!subscriptionOptions.authorizeReference) {
			ctx.context.logger.error(
				`Passing referenceId into a subscription action isn't allowed if subscription.authorizeReference isn't defined in your stripe plugin config.`,
			);
			throw new APIError("BAD_REQUEST", {
				message: STRIPE_ERROR_CODES.REFERENCE_ID_NOT_ALLOWED,
			});
		}
		const isAuthorized = await subscriptionOptions.authorizeReference(
			{
				user: ctxSession.user,
				session: ctxSession.session,
				referenceId: explicitReferenceId,
				action,
			},
			ctx,
		);
		if (!isAuthorized) {
			throw new APIError("UNAUTHORIZED", {
				message: STRIPE_ERROR_CODES.UNAUTHORIZED,
			});
		}
	});
