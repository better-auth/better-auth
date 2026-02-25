import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const ANONYMOUS_ERROR_CODES = defineErrorCodes({
	INVALID_EMAIL_FORMAT: "Email was not generated in a valid format",
	FAILED_TO_CREATE_USER: "Failed to create user",
	COULD_NOT_CREATE_SESSION: "Could not create session",
	ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
		"Anonymous users cannot sign in again anonymously",
	FAILED_TO_DELETE_ANONYMOUS_USER: "Failed to delete anonymous user",
	USER_IS_NOT_ANONYMOUS: "User is not anonymous",
	DELETE_ANONYMOUS_USER_DISABLED: "Deleting anonymous users is disabled",
});
