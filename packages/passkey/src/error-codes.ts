import { defineErrorCodes } from "@better-auth/core/utils";

export const PASSKEY_ERROR_CODES = defineErrorCodes({
	CHALLENGE_NOT_FOUND: "Challenge not found",
	YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
		"You are not allowed to register this passkey",
	FAILED_TO_VERIFY_REGISTRATION: "Failed to verify registration",
	PASSKEY_NOT_FOUND: "Passkey not found",
	AUTHENTICATION_FAILED: "Authentication failed",
	UNABLE_TO_CREATE_SESSION: "Unable to create session",
	FAILED_TO_UPDATE_PASSKEY: "Failed to update passkey",
});
