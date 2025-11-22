import { defineErrorCodes } from "@better-auth/core/utils";

export const PHONE_NUMBER_ERROR_CODES = defineErrorCodes({
	INVALID_PHONE_NUMBER: "Invalid phone number",
	PHONE_NUMBER_EXIST: "Phone number already exists",
	PHONE_NUMBER_NOT_EXIST: "phone number isn't registered",
	INVALID_PHONE_NUMBER_OR_PASSWORD: "Invalid phone number or password",
	UNEXPECTED_ERROR: "Unexpected error",
	OTP_NOT_FOUND: "OTP not found",
	OTP_EXPIRED: "OTP expired",
	INVALID_OTP: "Invalid OTP",
	PHONE_NUMBER_NOT_VERIFIED: "Phone number not verified",
	PHONE_NUMBER_CANNOT_BE_UPDATED: "Phone number cannot be updated",
	SEND_OTP_NOT_IMPLEMENTED: "sendOTP not implemented",
	TOO_MANY_ATTEMPTS: "Too many attempts",
});
