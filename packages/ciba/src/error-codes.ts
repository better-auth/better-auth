import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

/**
 * CIBA error vocabulary. The backchannel authentication endpoint and the
 * token-endpoint poll use distinct OAuth error codes (CIBA §11 and §13); these
 * descriptions are the single source for both the wire `error_description` and
 * the plugin's `$ERROR_CODES` catalog.
 *
 * @see https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html#rfc.section.13
 */
export const CIBA_ERROR_CODES = defineErrorCodes({
	// Backchannel authentication endpoint (CIBA §13).
	INVALID_REQUEST: "The request is malformed or missing a required parameter",
	INVALID_SCOPE: "The requested scope is invalid; it must include 'openid'",
	INVALID_BINDING_MESSAGE: "The binding_message is unacceptable",
	UNKNOWN_USER_ID: "The user identified by the hint could not be found",
	UNSUPPORTED_HINT:
		"Only login_hint is supported; id_token_hint and login_hint_token are not yet implemented",
	EXACTLY_ONE_HINT:
		"Exactly one of login_hint, id_token_hint, or login_hint_token is required",
	UNSUPPORTED_DELIVERY_MODE:
		"The client is not registered with a backchannel_token_delivery_mode this deployment supports",
	// Token endpoint poll (CIBA §11).
	AUTHORIZATION_PENDING: "The authorization request is still pending",
	SLOW_DOWN: "Polling too frequently; increase the interval",
	EXPIRED_TOKEN: "The auth_req_id has expired",
	ACCESS_DENIED: "The user denied the authorization request",
	INVALID_GRANT: "The auth_req_id is invalid or has already been consumed",
});
