import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const AGENT_AUTH_ERROR_CODES = defineErrorCodes({
	AGENT_NOT_FOUND: "Agent not found.",
	AGENT_REVOKED: "Agent has been revoked.",
	INVALID_JWT: "Invalid or expired agent JWT.",
	SCOPE_DENIED: "Agent does not have the required scope.",
	UNAUTHORIZED_SESSION: "Unauthorized or invalid session.",
	INVALID_PUBLIC_KEY: "Invalid public key format.",
	AGENT_NAME_REQUIRED: "Agent name is required.",
	INVALID_SCOPES: "Scopes must be an array of strings.",
});
