import { defineErrorCodes } from "@better-auth/core/utils";

export const ANONYMOUS_ERROR_CODES = defineErrorCodes({
	INVALID_EMAIL_FORMAT: "Email was not generated in a valid format",
	FAILED_TO_CREATE_USER: "Failed to create user",
	COULD_NOT_CREATE_SESSION: "Could not create session",
	ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
		"Anonymous users cannot sign in again anonymously",
});
