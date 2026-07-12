import type { SAML_ERROR_CODES } from "@better-auth/sso";
import type { LocalizedTranslations } from "../../../types";

export const ruSso: LocalizedTranslations<typeof SAML_ERROR_CODES> = {
	SINGLE_LOGOUT_NOT_ENABLED: "Единый выход (Single Logout) не включен",
	INVALID_LOGOUT_RESPONSE: "Неверный ответ о выходе (LogoutResponse)",
	INVALID_LOGOUT_REQUEST: "Неверный запрос о выходе (LogoutRequest)",
	LOGOUT_FAILED_AT_IDP: "Ошибка выхода на стороне IdP",
	IDP_SLO_NOT_SUPPORTED:
		"IdP не поддерживает службу единого выхода (Single Logout)",
	SAML_PROVIDER_NOT_FOUND: "SAML-провайдер не найден",
	CERT_SOURCE_MISSING:
		"samlConfig требует наличия сертификата подписи (cert или idpMetadata.cert) либо XML-документа idpMetadata.metadata.",
};
