import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const REFRESHABLE_SESSION_ERROR_CODES = defineErrorCodes({
	INVALID_REFRESH_TOKEN: "The refresh token is invalid",
	REFRESH_TOKEN_EXPIRED: "The refresh token has expired",
	REFRESH_TOKEN_REUSED: "Refresh token reuse was detected",
	INVALID_REFRESH_CLIENT: "The refresh token does not belong to this client",
	REFRESH_SESSION_USER_NOT_FOUND: "The refresh token user no longer exists",
	REFRESH_SESSION_CREATION_FAILED: "Failed to create a refreshed session",
	NATIVE_SESSION_UPDATE_FAILED: "Failed to apply the native session lifetime",
});
