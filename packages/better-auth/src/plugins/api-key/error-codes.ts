import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const API_KEY_ERROR_CODES = defineErrorCodes({
	ERR_INVALID_METADATA_TYPE: "metadata must be an object or undefined",
	ERR_REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
		"refillAmount is required when refillInterval is provided",
	ERR_REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
		"refillInterval is required when refillAmount is provided",
	ERR_USER_BANNED: "User is banned",
	ERR_UNAUTHORIZED_SESSION: "Unauthorized or invalid session",
	ERR_KEY_NOT_FOUND: "API Key not found",
	ERR_KEY_DISABLED: "API Key is disabled",
	ERR_KEY_EXPIRED: "API Key has expired",
	ERR_USAGE_EXCEEDED: "API Key has reached its usage limit",
	ERR_KEY_NOT_RECOVERABLE: "API Key is not recoverable",
	ERR_EXPIRES_IN_IS_TOO_SMALL:
		"The expiresIn is smaller than the predefined minimum value.",
	ERR_EXPIRES_IN_IS_TOO_LARGE:
		"The expiresIn is larger than the predefined maximum value.",
	ERR_INVALID_REMAINING: "The remaining count is either too large or too small.",
	ERR_INVALID_PREFIX_LENGTH: "The prefix length is either too large or too small.",
	ERR_INVALID_NAME_LENGTH: "The name length is either too large or too small.",
	ERR_METADATA_DISABLED: "Metadata is disabled.",
	ERR_RATE_LIMIT_EXCEEDED: "Rate limit exceeded.",
	ERR_NO_VALUES_TO_UPDATE: "No values to update.",
	ERR_KEY_DISABLED_EXPIRATION: "Custom key expiration values are disabled.",
	ERR_INVALID_API_KEY: "Invalid API key.",
	ERR_INVALID_USER_ID_FROM_API_KEY: "The user id from the API key is invalid.",
	ERR_INVALID_API_KEY_GETTER_RETURN_TYPE:
		"API Key getter returned an invalid key type. Expected string.",
	ERR_SERVER_ONLY_PROPERTY:
		"The property you're trying to set can only be set from the server auth instance only.",
	ERR_FAILED_TO_UPDATE_API_KEY: "Failed to update API key",
	ERR_NAME_REQUIRED: "API Key name is required.",
});
