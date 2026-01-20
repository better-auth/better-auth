import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const TOKEN_EXCHANGE_ERROR_CODES = defineErrorCodes({
	INVALID_GRANT: "Invalid grant type for token exchange",
	INVALID_SUBJECT_TOKEN: "Subject token is invalid or expired",
	INVALID_ACTOR_TOKEN: "Actor token is invalid or expired",
	INVALID_SCOPE: "Requested scope exceeds the scope of the subject token",
	ACCESS_DENIED: "No valid grant found for this exchange",
	UNSUPPORTED_TOKEN_TYPE: "Unsupported token type for exchange",
	INVALID_AUDIENCE: "Invalid audience for token exchange",
	EXCHANGE_NOT_ALLOWED: "Token exchange is not allowed for this request",
	MISSING_SUBJECT_TOKEN: "Subject token is required",
	USER_NOT_FOUND: "User from subject token not found",
});
