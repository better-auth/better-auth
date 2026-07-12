import type { SAML_ERROR_CODES } from "@better-auth/sso";
import type { LocalizedTranslations } from "../../../types";

export const itSso: LocalizedTranslations<typeof SAML_ERROR_CODES> = {
	SINGLE_LOGOUT_NOT_ENABLED: "Il Single Logout non è abilitato",
	INVALID_LOGOUT_RESPONSE: "LogoutResponse non valida",
	INVALID_LOGOUT_REQUEST: "LogoutRequest non valida",
	LOGOUT_FAILED_AT_IDP: "Disconnessione non riuscita presso l'IdP",
	IDP_SLO_NOT_SUPPORTED: "L'IdP non supporta il servizio di Single Logout",
	SAML_PROVIDER_NOT_FOUND: "Fornitore SAML non trovato",
	CERT_SOURCE_MISSING:
		"samlConfig richiede un certificato di firma (cert o idpMetadata.cert) o un documento XML idpMetadata.metadata.",
};
