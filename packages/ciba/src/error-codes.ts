import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const CIBA_ERROR_CODES = defineErrorCodes({
	AUTHORIZATION_PENDING: "The authorization request is still pending",
	SLOW_DOWN: "Polling too frequently, increase interval",
	EXPIRED_TOKEN: "The auth_req_id has expired",
	ACCESS_DENIED: "The user denied the authorization request",
	INVALID_GRANT: "The auth_req_id is invalid or has already been consumed",
	INVALID_BINDING_MESSAGE: "The binding_message is invalid",
	UNKNOWN_USER: "The user identified by the hint could not be found",
	MISSING_HINT:
		"Exactly one of login_hint, id_token_hint, or login_hint_token is required",
	MISSING_NOTIFICATION_TOKEN:
		"client_notification_token is required for push/ping delivery modes",
});
