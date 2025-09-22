import { BASE_ERROR_CODES as CORE_BASE_ERROR_CODES } from "@better-auth/core";

// Extend the core error codes with server-specific ones
export const BASE_ERROR_CODES = {
	...CORE_BASE_ERROR_CODES,
	// Additional server-specific error codes
	FAILED_TO_CREATE_SESSION: "Failed to create session",
	FAILED_TO_UPDATE_USER: "Failed to update user",
	FAILED_TO_GET_SESSION: "Failed to get session",
	ID_TOKEN_NOT_SUPPORTED: "id_token not supported",
	USER_EMAIL_NOT_FOUND: "User email not found",
	EMAIL_NOT_VERIFIED: "Email not verified",
	EMAIL_CAN_NOT_BE_UPDATED: "Email can not be updated",
	SESSION_EXPIRED: "Session expired. Re-authenticate to perform this action.",
	FAILED_TO_UNLINK_LAST_ACCOUNT: "You can't unlink your last account",
	ACCOUNT_NOT_FOUND: "Account not found",
	USER_ALREADY_HAS_PASSWORD:
		"User already has a password. Provide that to delete the account.",
} as const;
