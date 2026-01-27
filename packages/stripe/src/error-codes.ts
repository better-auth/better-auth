import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const STRIPE_ERROR_CODES = defineErrorCodes({
	ERR_UNAUTHORIZED: "Unauthorized access",
	ERR_INVALID_REQUEST_BODY: "Invalid request body",
	ERR_SUBSCRIPTION_NOT_FOUND: "Subscription not found",
	ERR_SUBSCRIPTION_PLAN_NOT_FOUND: "Subscription plan not found",
	ERR_ALREADY_SUBSCRIBED_PLAN: "You're already subscribed to this plan",
	ERR_REFERENCE_ID_NOT_ALLOWED: "Reference id is not allowed",
	ERR_CUSTOMER_NOT_FOUND: "Stripe customer not found for this user",
	ERR_UNABLE_TO_CREATE_CUSTOMER: "Unable to create customer",
	ERR_UNABLE_TO_CREATE_BILLING_PORTAL: "Unable to create billing portal session",
	ERR_STRIPE_SIGNATURE_NOT_FOUND: "Stripe signature not found",
	ERR_STRIPE_WEBHOOK_SECRET_NOT_FOUND: "Stripe webhook secret not found",
	ERR_STRIPE_WEBHOOK_ERROR: "Stripe webhook error",
	ERR_FAILED_TO_CONSTRUCT_STRIPE_EVENT: "Failed to construct Stripe event",
	ERR_FAILED_TO_FETCH_PLANS: "Failed to fetch plans",
	ERR_EMAIL_VERIFICATION_REQUIRED:
		"Email verification is required before you can subscribe to a plan",
	ERR_SUBSCRIPTION_NOT_ACTIVE: "Subscription is not active",
	ERR_SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
		"Subscription is not scheduled for cancellation",
	ERR_ORGANIZATION_NOT_FOUND: "Organization not found",
	ERR_ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
		"Organization subscription is not enabled",
	ERR_ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
		"Cannot delete organization with active subscription",
	ERR_ORGANIZATION_REFERENCE_ID_REQUIRED:
		"Reference ID is required. Provide referenceId or set activeOrganizationId in session",
});
