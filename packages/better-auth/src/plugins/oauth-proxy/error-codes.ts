import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const OAUTH_PROXY_ERROR_CODES = defineErrorCodes({
	MISSING_PROFILE: "OAuth proxy callback missing profile data",
	INVALID_PROFILE: "Failed to decrypt OAuth proxy profile",
	INVALID_PAYLOAD: "Failed to parse OAuth proxy payload",
	PAYLOAD_EXPIRED: "OAuth proxy payload expired or invalid",
	NO_CODE: "OAuth callback missing authorization code",
	INVALID_CODE: "Failed to validate authorization code",
	PROVIDER_NOT_FOUND: "OAuth provider not found",
	UNABLE_TO_GET_USER_INFO: "Unable to get user info from provider",
	EMAIL_NOT_FOUND: "Provider did not return email",
	USER_CREATION_FAILED: "Failed to create user or session",
});
