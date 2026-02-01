import { defineErrorCodes } from "@better-auth/core/utils";

export const STRIPE_ERROR_CODES = defineErrorCodes({
	UNAUTHORIZED: "Unauthorized access",
	INVALID_REQUEST_BODY: "Invalid request body",
	SUBSCRIPTION_NOT_FOUND: "Subscription not found",
	SUBSCRIPTION_PLAN_NOT_FOUND: "Subscription plan not found",
	ALREADY_SUBSCRIBED_PLAN: "You're already subscribed to this plan",
	REFERENCE_ID_NOT_ALLOWED: "Reference id is not allowed",
	CUSTOMER_NOT_FOUND: "Stripe customer not found for this user",
	UNABLE_TO_CREATE_CUSTOMER: "Unable to create customer",
	UNABLE_TO_CREATE_BILLING_PORTAL: "Unable to create billing portal session",
	STRIPE_SIGNATURE_NOT_FOUND: "Stripe signature not found",
	STRIPE_WEBHOOK_SECRET_NOT_FOUND: "Stripe webhook secret not found",
	STRIPE_WEBHOOK_ERROR: "Stripe webhook error",
	FAILED_TO_CONSTRUCT_STRIPE_EVENT: "Failed to construct Stripe event",
	FAILED_TO_FETCH_PLANS: "Failed to fetch plans",
	EMAIL_VERIFICATION_REQUIRED:
		"Email verification is required before you can subscribe to a plan",
	SUBSCRIPTION_NOT_ACTIVE: "Subscription is not active",
	SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
		"Subscription is not scheduled for cancellation",
	ORGANIZATION_NOT_FOUND: "Organization not found",
	ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
		"Organization subscription is not enabled",
	AUTHORIZE_REFERENCE_REQUIRED:
		"Organization subscriptions require authorizeReference callback to be configured",
	ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
		"Cannot delete organization with active subscription",
	ORGANIZATION_REFERENCE_ID_REQUIRED:
		"Reference ID is required. Provide referenceId or set activeOrganizationId in session",
});
