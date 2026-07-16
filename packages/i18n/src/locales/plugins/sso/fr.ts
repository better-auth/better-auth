import type { SAML_ERROR_CODES } from "@better-auth/sso";
import type { LocalizedTranslations } from "../../../types";

export const frSso: LocalizedTranslations<typeof SAML_ERROR_CODES> = {
	SINGLE_LOGOUT_NOT_ENABLED:
		"La déconnexion unique (Single Logout) n'est pas activée",
	INVALID_LOGOUT_RESPONSE: "LogoutResponse invalide",
	INVALID_LOGOUT_REQUEST: "LogoutRequest invalide",
	LOGOUT_FAILED_AT_IDP: "Échec de la déconnexion chez l'IdP",
	IDP_SLO_NOT_SUPPORTED:
		"L'IdP ne prend pas en charge le service de déconnexion unique",
	SAML_PROVIDER_NOT_FOUND: "Fournisseur SAML non trouvé",
	CERT_SOURCE_MISSING:
		"samlConfig nécessite soit un certificat de signature (cert ou idpMetadata.cert), soit un document XML idpMetadata.metadata.",
};
