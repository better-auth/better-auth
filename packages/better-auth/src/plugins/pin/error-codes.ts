import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const PIN_ERROR_CODES = defineErrorCodes({
	PIN_NOT_SET: "No PIN is set for this user",
	PIN_ALREADY_SET: "A PIN is already set for this user",
	INVALID_PIN: "Invalid PIN",
	INVALID_CURRENT_PIN: "Invalid current PIN",
	INVALID_PASSWORD: "Invalid password",
	PASSWORD_REQUIRED: "Password is required to perform this action",
	PIN_TOO_SHORT: "PIN is too short",
	PIN_TOO_LONG: "PIN is too long",
	INVALID_PIN_FORMAT: "PIN format is invalid",
	PIN_LOCKED: "Too many failed attempts. Try again later",
});
