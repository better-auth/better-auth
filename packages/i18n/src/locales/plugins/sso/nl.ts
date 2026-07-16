import type { SAML_ERROR_CODES } from "@better-auth/sso";
import type { LocalizedTranslations } from "../../../types";

export const nlSso: LocalizedTranslations<typeof SAML_ERROR_CODES> = {
	SINGLE_LOGOUT_NOT_ENABLED: "Single Logout is niet ingeschakeld",
	INVALID_LOGOUT_RESPONSE: "Ongeldige LogoutResponse",
	INVALID_LOGOUT_REQUEST: "Ongeldige LogoutRequest",
	LOGOUT_FAILED_AT_IDP: "Afmelden mislukt bij IdP",
	IDP_SLO_NOT_SUPPORTED: "IdP ondersteunt Single Logout-service niet",
	SAML_PROVIDER_NOT_FOUND: "SAML-provider niet gevonden",
	CERT_SOURCE_MISSING:
		"samlConfig vereist een ondertekeningscertificaat (cert of idpMetadata.cert) of een idpMetadata.metadata XML-document.",
};
