import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const AGENT_AUTH_ERROR_CODES = defineErrorCodes({
	AGENT_NOT_FOUND: "Agent not found.",
	AGENT_REVOKED: "Agent has been revoked.",
	INVALID_TOKEN: "Invalid agent token.",
	INVALID_JWT: "Invalid or expired agent JWT.",
	SCOPE_DENIED: "Agent does not have the required scope.",
	UNAUTHORIZED_SESSION: "Unauthorized or invalid session.",
	AUTH_METHOD_MISMATCH:
		"Operation not supported for this agent's auth method.",
	INVALID_PUBLIC_KEY: "Invalid public key format.",
	AUTH_METHOD_NOT_ALLOWED: "This auth method is not allowed by configuration.",
	AGENT_NAME_REQUIRED: "Agent name is required.",
	INVALID_SCOPES: "Scopes must be an array of strings.",
});
