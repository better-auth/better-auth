import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const SAML_ERROR_CODES = defineErrorCodes({
	// SLO errors
	SINGLE_LOGOUT_NOT_ENABLED: "Single Logout is not enabled",
	INVALID_LOGOUT_RESPONSE: "Invalid LogoutResponse",
	INVALID_LOGOUT_REQUEST: "Invalid LogoutRequest",
	LOGOUT_FAILED_AT_IDP: "Logout failed at IdP",
	IDP_SLO_NOT_SUPPORTED: "IdP does not support Single Logout Service",
	SAML_PROVIDER_NOT_FOUND: "SAML provider not found",
});
