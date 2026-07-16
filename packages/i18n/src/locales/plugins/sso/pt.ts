import type { SAML_ERROR_CODES } from "@better-auth/sso";
import type { LocalizedTranslations } from "../../../types";

export const ptSso: LocalizedTranslations<typeof SAML_ERROR_CODES> = {
	SINGLE_LOGOUT_NOT_ENABLED: "Single Logout não está ativado",
	INVALID_LOGOUT_RESPONSE: "LogoutResponse inválida",
	INVALID_LOGOUT_REQUEST: "LogoutRequest inválida",
	LOGOUT_FAILED_AT_IDP: "Falha ao efetuar logout no IdP",
	IDP_SLO_NOT_SUPPORTED: "O IdP não suporta o serviço de Single Logout",
	SAML_PROVIDER_NOT_FOUND: "Provedor SAML não encontrado",
	CERT_SOURCE_MISSING:
		"samlConfig exige um certificado de assinatura (cert ou idpMetadata.cert) ou um documento XML idpMetadata.metadata.",
};
