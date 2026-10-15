import { defineErrorCodes } from "@better-auth/core/utils/error-codes";
import { APIError } from "better-auth/api";

/**
 * Error descriptions for the backchannel authentication endpoint (CIBA §13),
 * the token poll (CIBA §11), and the approval link.
 */
export const CIBA_ERROR_CODES = defineErrorCodes({
	INVALID_SCOPE: "The requested scope must include 'openid'",
	INVALID_BINDING_MESSAGE: "The binding_message must be plain text",
	UNKNOWN_USER_ID: "The user identified by the hint could not be found",
	EXACTLY_ONE_HINT:
		"Exactly one of login_hint, id_token_hint, or login_hint_token is required",
	UNSUPPORTED_HINT: "Only login_hint is supported",
	UNSUPPORTED_DELIVERY_MODE:
		"The client is not registered for a delivery mode this server supports",
	NOTIFICATION_TOKEN_REQUIRED:
		"client_notification_token is required for ping delivery",
	INVALID_AUTH_REQ_ID: "The auth_req_id is invalid or has already been used",
	EXPIRED_AUTH_REQ_ID: "The auth_req_id has expired",
	AUTHORIZATION_PENDING: "The user has not yet approved or denied the request",
	POLLING_TOO_FREQUENTLY: "Polling too frequently",
	ACCESS_DENIED: "The user denied the request",
	USER_NOT_FOUND: "The user who approved the request no longer exists",
	UNKNOWN_REQUEST:
		"This sign-in request is invalid, has expired, or was sent to another account",
});

/** Throws an OAuth error response (`error` and `error_description`). */
export function oauthError(
	error: string,
	description: string,
	status: "BAD_REQUEST" | "INTERNAL_SERVER_ERROR" = "BAD_REQUEST",
): never {
	throw new APIError(status, { error, error_description: description });
}
