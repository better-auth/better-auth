import type { ANONYMOUS_ERROR_CODES } from "better-auth/plugins/anonymous";
import type { LocalizedTranslations } from "../../../types";

export const zhAnonymous: LocalizedTranslations<typeof ANONYMOUS_ERROR_CODES> =
	{
		INVALID_EMAIL_FORMAT: "Email was not generated in a valid format",
		FAILED_TO_CREATE_USER: "Failed to create user",
		COULD_NOT_CREATE_SESSION: "Could not create session",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Anonymous users cannot sign in again anonymously",
		FAILED_TO_DELETE_ANONYMOUS_USER: "Failed to delete anonymous user",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Failed to delete anonymous user sessions",
		USER_IS_NOT_ANONYMOUS: "User is not anonymous",
		DELETE_ANONYMOUS_USER_DISABLED: "Deleting anonymous users is disabled",
	};
