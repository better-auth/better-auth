import type { SAML_ERROR_CODES } from "@better-auth/sso";
import type { LocalizedTranslations } from "../../../types";

export const enSso: LocalizedTranslations<typeof SAML_ERROR_CODES> = {
	SINGLE_LOGOUT_NOT_ENABLED: "Single Logout is not enabled",
	INVALID_LOGOUT_RESPONSE: "Invalid LogoutResponse",
	INVALID_LOGOUT_REQUEST: "Invalid LogoutRequest",
	LOGOUT_FAILED_AT_IDP: "Logout failed at IdP",
	IDP_SLO_NOT_SUPPORTED: "IdP does not support Single Logout Service",
	SAML_PROVIDER_NOT_FOUND: "SAML provider not found",
	CERT_SOURCE_MISSING:
		"samlConfig requires either a signing certificate (cert or idpMetadata.cert) or an idpMetadata.metadata XML document.",
};
