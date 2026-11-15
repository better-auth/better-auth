import { defineErrorCodes } from "@better-auth/core/utils/error-codes";
import { APIError } from "better-auth/api";

/** Error descriptions of the authorization challenge endpoint. */
export const FIRST_PARTY_APPS_ERROR_CODES = defineErrorCodes({
	FIRST_REQUEST_FORM_ENCODED:
		"The first request must be application/x-www-form-urlencoded",
	CLIENT_ID_REQUIRED: "client_id is required without auth_session",
	UNKNOWN_CLIENT: "The client is unknown or disabled",
	NOT_FIRST_PARTY: "The client is not registered as a first-party app",
	FIRST_PARTY_REQUIRES_SKIP_CONSENT:
		"A first-party app must be registered with skip_consent",
	INVALID_SESSION: "The auth_session is invalid, expired, or revoked",
	DPOP_PROOF_NOT_BOUND:
		"This auth_session is not bound to a DPoP key; send no DPoP proof",
	AUTHENTICATION_FAILED: "The credentials are incorrect",
	CREDENTIALS_REQUIRED: "Send the credentials of a supported sign-in method",
	REDIRECT_TO_WEB: "Continue the sign-in in a browser",
	STEP_UP_REQUIRED: "This grant requires stronger authentication",
});

/** An error response of draft §5.2.2, with the status its code requires. */
export function challengeError(
	error:
		| "invalid_request"
		| "invalid_client"
		| "unauthorized_client"
		| "invalid_session"
		| "authentication_failed"
		| "insufficient_authorization"
		| "redirect_to_web"
		| "invalid_dpop_proof",
	description: string,
	fields: Record<string, unknown> = {},
): never {
	// §5.2.2.1: insufficient_authorization and redirect_to_web are 403;
	// every other code is 400.
	const status =
		error === "insufficient_authorization" || error === "redirect_to_web"
			? "FORBIDDEN"
			: "BAD_REQUEST";
	throw new APIError(status, {
		error,
		error_description: description,
		...fields,
	});
}
