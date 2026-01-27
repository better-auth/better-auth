import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const PHONE_NUMBER_ERROR_CODES = defineErrorCodes({
	ERR_INVALID_PHONE_NUMBER: "Invalid phone number",
	ERR_PHONE_NUMBER_EXIST: "Phone number already exists",
	ERR_PHONE_NUMBER_NOT_EXIST: "phone number isn't registered",
	ERR_INVALID_PHONE_NUMBER_OR_PASSWORD: "Invalid phone number or password",
	ERR_UNEXPECTED_ERROR: "Unexpected error",
	ERR_OTP_NOT_FOUND: "OTP not found",
	ERR_OTP_EXPIRED: "OTP expired",
	ERR_INVALID_OTP: "Invalid OTP",
	ERR_PHONE_NUMBER_NOT_VERIFIED: "Phone number not verified",
	ERR_PHONE_NUMBER_CANNOT_BE_UPDATED: "Phone number cannot be updated",
	ERR_SEND_OTP_NOT_IMPLEMENTED: "sendOTP not implemented",
	ERR_TOO_MANY_ATTEMPTS: "Too many attempts",
});
