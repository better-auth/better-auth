import { defineErrorCodes } from "@better-auth/core/utils";

export const STRIPE_ERROR_CODES = defineErrorCodes({
	SUBSCRIPTION_NOT_FOUND: "Subscription not found",
	SUBSCRIPTION_PLAN_NOT_FOUND: "Subscription plan not found",
	ALREADY_SUBSCRIBED_PLAN: "You're already subscribed to this plan",
	UNABLE_TO_CREATE_CUSTOMER: "Unable to create customer",
	FAILED_TO_FETCH_PLANS: "Failed to fetch plans",
	EMAIL_VERIFICATION_REQUIRED:
		"Email verification is required before you can subscribe to a plan",
	SUBSCRIPTION_NOT_ACTIVE: "Subscription is not active",
	SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
		"Subscription is not scheduled for cancellation",
	UNAUTHORIZED: "Unauthorized",
	PRICE_ID_NOT_FOUND: "Price ID not found for the selected plan",
	SUBSCRIPTION_ID_NOT_FOUND: "Subscription ID not found",
	CUSTOMER_ID_NOT_FOUND: "No Stripe customer found for this user",
	REQUEST_BODY_NOT_FOUND: "Request body not found",
	STRIPE_WEBHOOK_SECRET_NOT_FOUND: "Stripe webhook secret not found",
	STRIPE_WEBHOOK_EVENT_NOT_FOUND: "Failed to construct event",
	STRIPE_WEBHOOK_ERROR: "Stripe webhook error",
	REFERENCE_ID_NOT_ALLOWED:
		"Reference id is not allowed. Read server logs for more details.",
});
