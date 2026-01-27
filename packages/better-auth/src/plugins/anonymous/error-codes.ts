import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const ANONYMOUS_ERROR_CODES = defineErrorCodes({
	ERR_INVALID_EMAIL_FORMAT: "Email was not generated in a valid format",
	ERR_FAILED_TO_CREATE_USER: "Failed to create user",
	ERR_COULD_NOT_CREATE_SESSION: "Could not create session",
	ERR_ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
		"Anonymous users cannot sign in again anonymously",
	ERR_FAILED_TO_DELETE_ANONYMOUS_USER: "Failed to delete anonymous user",
	ERR_USER_IS_NOT_ANONYMOUS: "User is not anonymous",
	ERR_DELETE_ANONYMOUS_USER_DISABLED: "Deleting anonymous users is disabled",
});
