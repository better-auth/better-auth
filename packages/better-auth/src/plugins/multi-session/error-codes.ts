import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const MULTI_SESSION_ERROR_CODES = defineErrorCodes({
	INVALID_SESSION_TOKEN: "Invalid session token",
});
