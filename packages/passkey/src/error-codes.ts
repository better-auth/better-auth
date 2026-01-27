import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const PASSKEY_ERROR_CODES = defineErrorCodes({
	ERR_CHALLENGE_NOT_FOUND: "Challenge not found",
	ERR_YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
		"You are not allowed to register this passkey",
	ERR_FAILED_TO_VERIFY_REGISTRATION: "Failed to verify registration",
	ERR_PASSKEY_NOT_FOUND: "Passkey not found",
	ERR_AUTHENTICATION_FAILED: "Authentication failed",
	ERR_UNABLE_TO_CREATE_SESSION: "Unable to create session",
	ERR_FAILED_TO_UPDATE_PASSKEY: "Failed to update passkey",
});
