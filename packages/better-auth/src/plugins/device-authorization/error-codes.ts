import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const DEVICE_AUTHORIZATION_ERROR_CODES = defineErrorCodes({
	ERR_INVALID_DEVICE_CODE: "Invalid device code",
	ERR_EXPIRED_DEVICE_CODE: "Device code has expired",
	ERR_EXPIRED_USER_CODE: "User code has expired",
	ERR_AUTHORIZATION_PENDING: "Authorization pending",
	ERR_ACCESS_DENIED: "Access denied",
	ERR_INVALID_USER_CODE: "Invalid user code",
	ERR_DEVICE_CODE_ALREADY_PROCESSED: "Device code already processed",
	ERR_POLLING_TOO_FREQUENTLY: "Polling too frequently",
	ERR_USER_NOT_FOUND: "User not found",
	ERR_FAILED_TO_CREATE_SESSION: "Failed to create session",
	ERR_INVALID_DEVICE_CODE_STATUS: "Invalid device code status",
	ERR_AUTHENTICATION_REQUIRED: "Authentication required",
});
