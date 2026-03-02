import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const CIBA_ERROR_CODES = defineErrorCodes({
	// Client/Request errors
	INVALID_REQUEST: "Invalid request",
	INVALID_CLIENT: "Invalid client credentials",
	INVALID_SCOPE: "Invalid or unsupported scope",
	UNKNOWN_USER_ID: "Unable to identify user from login_hint",
	MISSING_LOGIN_HINT: "login_hint is required",

	// Polling errors
	AUTHORIZATION_PENDING: "The authorization request is still pending",
	SLOW_DOWN: "Polling too frequently, please slow down",
	EXPIRED_TOKEN: "The auth_req_id has expired",
	ACCESS_DENIED: "The user rejected the authorization request",

	// Verification errors
	INVALID_AUTH_REQ_ID: "Invalid or unknown auth_req_id",
	REQUEST_ALREADY_PROCESSED: "This request has already been approved or denied",

	// Session errors
	AUTHENTICATION_REQUIRED: "User must be authenticated to approve requests",
	USER_MISMATCH: "Authenticated user does not match the requested user",

	// Plugin errors
	OIDC_PROVIDER_REQUIRED: "CIBA requires the oidcProvider plugin to be enabled",
});
