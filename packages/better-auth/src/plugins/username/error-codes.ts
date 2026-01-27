import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const USERNAME_ERROR_CODES = defineErrorCodes({
	ERR_INVALID_USERNAME_OR_PASSWORD: "Invalid username or password",
	ERR_EMAIL_NOT_VERIFIED: "Email not verified",
	ERR_UNEXPECTED_ERROR: "Unexpected error",
	ERR_USERNAME_IS_ALREADY_TAKEN: "Username is already taken. Please try another.",
	ERR_USERNAME_TOO_SHORT: "Username is too short",
	ERR_USERNAME_TOO_LONG: "Username is too long",
	ERR_INVALID_USERNAME: "Username is invalid",
	ERR_INVALID_DISPLAY_USERNAME: "Display username is invalid",
});
