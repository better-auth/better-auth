import { defineErrorCodes } from "better-auth";

export const ELECTRON_ERROR_CODES = defineErrorCodes({
	INVALID_CLIENT_ID: "Invalid client ID",
	INVALID_TOKEN: "Invalid or expired token.",
	STATE_MISMATCH: "state mismatch",
	MISSING_CODE_CHALLENGE: "missing code challenge",
	INVALID_CODE_VERIFIER: "Invalid code verifier",
	MISSING_STATE: "state is required",
	MISSING_PKCE: "pkce is required",
	PLAIN_PKCE_REJECTED: "plain PKCE challenge method is not supported; use S256",
});
