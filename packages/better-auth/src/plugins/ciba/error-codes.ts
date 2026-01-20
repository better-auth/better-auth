import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const CIBA_ERROR_CODES = defineErrorCodes({
	INVALID_CLIENT: "Invalid client credentials",
	UNKNOWN_USER: "Unable to identify user from provided hints",
	INVALID_REQUEST: "Invalid or missing request parameters",
	AUTHORIZATION_PENDING: "User has not yet approved the request",
	ACCESS_DENIED: "User denied the authorization request",
	EXPIRED_TOKEN: "The authentication request has expired",
	SLOW_DOWN: "Polling too frequently, please wait longer between requests",
	INVALID_AUTH_REQ_ID: "Invalid or unknown auth_req_id",
	REQUEST_ALREADY_PROCESSED: "This request has already been approved or denied",
	USER_NOT_FOUND: "User not found",
	USER_MISMATCH: "Authenticated user does not match the request",
	NOTIFICATION_FAILED: "Failed to send notification to user",
});
