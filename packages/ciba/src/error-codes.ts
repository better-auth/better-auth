import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

/**
 * Error descriptions for the backchannel authentication endpoint (CIBA §13),
 * the token poll (CIBA §11), and the approval endpoints.
 */
export const CIBA_ERROR_CODES = defineErrorCodes({
	INVALID_SCOPE: "The requested scope must include 'openid'",
	INVALID_BINDING_MESSAGE: "The binding_message must be plain text",
	UNKNOWN_USER_ID: "The user identified by the hint could not be found",
	EXACTLY_ONE_HINT:
		"Exactly one of login_hint, id_token_hint, or login_hint_token is required",
	UNSUPPORTED_HINT: "Only login_hint is supported",
	UNSUPPORTED_DELIVERY_MODE:
		"The client is not registered with a backchannel_token_delivery_mode this server supports",
	NOTIFICATION_TOKEN_REQUIRED:
		"client_notification_token is required for ping delivery",
	INVALID_NOTIFICATION_ENDPOINT:
		"The client must register an https backchannel_client_notification_endpoint on a public host for ping delivery",
	INVALID_AUTH_REQ_ID: "The auth_req_id is invalid or has already been used",
	EXPIRED_AUTH_REQ_ID: "The auth_req_id has expired",
	INVALID_REQUEST_STATUS: "Invalid backchannel request status",
	REQUEST_ALREADY_PROCESSED: "The request has already been approved or denied",
});
