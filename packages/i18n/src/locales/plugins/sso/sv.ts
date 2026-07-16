import type { SAML_ERROR_CODES } from "@better-auth/sso";
import type { LocalizedTranslations } from "../../../types";

export const svSso: LocalizedTranslations<typeof SAML_ERROR_CODES> = {
	SINGLE_LOGOUT_NOT_ENABLED: "Single Logout är inte aktiverat",
	INVALID_LOGOUT_RESPONSE: "Ogiltigt LogoutResponse",
	INVALID_LOGOUT_REQUEST: "Ogiltigt LogoutRequest",
	LOGOUT_FAILED_AT_IDP: "Utloggning misslyckades hos IdP",
	IDP_SLO_NOT_SUPPORTED: "IdP stöder inte tjänsten Single Logout",
	SAML_PROVIDER_NOT_FOUND: "SAML-leverantör hittades inte",
	CERT_SOURCE_MISSING:
		"samlConfig kräver antingen ett signeringscertifikat (cert eller idpMetadata.cert) eller ett idpMetadata.metadata XML-dokument.",
};
