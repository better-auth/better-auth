import type { SAML_ERROR_CODES } from "@better-auth/sso";
import type { LocalizedTranslations } from "../../../types";

export const plSso: LocalizedTranslations<typeof SAML_ERROR_CODES> = {
	SINGLE_LOGOUT_NOT_ENABLED:
		"Jednokrotne wylogowanie (Single Logout) nie jest włączone",
	INVALID_LOGOUT_RESPONSE:
		"Nieprawidłowa odpowiedź wylogowania (LogoutResponse)",
	INVALID_LOGOUT_REQUEST: "Nieprawidłowe żądanie wylogowania (LogoutRequest)",
	LOGOUT_FAILED_AT_IDP:
		"Wylogowanie u dostawcy tożsamości (IdP) nie powiodło się",
	IDP_SLO_NOT_SUPPORTED:
		"Dostawca tożsamości (IdP) nie obsługuje usługi Single Logout",
	SAML_PROVIDER_NOT_FOUND: "Nie znaleziono dostawcy SAML",
	CERT_SOURCE_MISSING:
		"samlConfig wymaga certyfikatu podpisywania (cert lub idpMetadata.cert) albo dokumentu XML idpMetadata.metadata.",
};
