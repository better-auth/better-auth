import type { SAML_ERROR_CODES } from "@better-auth/sso";
import type { LocalizedTranslations } from "../../../types";

export const deSso: LocalizedTranslations<typeof SAML_ERROR_CODES> = {
	SINGLE_LOGOUT_NOT_ENABLED: "Single Logout ist nicht aktiviert",
	INVALID_LOGOUT_RESPONSE: "Ungültige Logout-Antwort (LogoutResponse)",
	INVALID_LOGOUT_REQUEST: "Ungültige Logout-Anfrage (LogoutRequest)",
	LOGOUT_FAILED_AT_IDP: "Logout beim IdP fehlgeschlagen",
	IDP_SLO_NOT_SUPPORTED: "Der IdP unterstützt den Single-Logout-Dienst nicht",
	SAML_PROVIDER_NOT_FOUND: "SAML-Anbieter nicht gefunden",
	CERT_SOURCE_MISSING:
		"samlConfig erfordert entweder ein Signaturzertifikat (cert oder idpMetadata.cert) oder ein idpMetadata.metadata XML-Dokument.",
};
