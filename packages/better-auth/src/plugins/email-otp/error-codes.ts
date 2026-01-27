import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const EMAIL_OTP_ERROR_CODES = defineErrorCodes({
	ERR_OTP_EXPIRED: "OTP expired",
	ERR_INVALID_OTP: "Invalid OTP",
	ERR_TOO_MANY_ATTEMPTS: "Too many attempts",
});
