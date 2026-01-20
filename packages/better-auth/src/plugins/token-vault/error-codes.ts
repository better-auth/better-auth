import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const TOKEN_VAULT_ERROR_CODES = defineErrorCodes({
	GRANT_NOT_FOUND:
		"No grant found for this user, agent, and provider combination",
	GRANT_REVOKED: "This grant has been revoked",
	GRANT_EXPIRED: "This grant has expired",
	UNAUTHORIZED_AGENT: "Agent is not authorized to access this grant",
	INVALID_PROVIDER: "Invalid provider specified",
	ENCRYPTION_KEY_REQUIRED: "Encryption key is required for token vault",
	DECRYPTION_FAILED: "Failed to decrypt token",
	USER_NOT_FOUND: "User not found",
	INVALID_SCOPES: "Invalid scopes provided",
});
