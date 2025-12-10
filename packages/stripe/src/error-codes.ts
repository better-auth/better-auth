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
});
