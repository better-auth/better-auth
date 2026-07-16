import type { SAML_ERROR_CODES } from "@better-auth/sso";
import type { LocalizedTranslations } from "../../../types";

export const ukSso: LocalizedTranslations<typeof SAML_ERROR_CODES> = {
	SINGLE_LOGOUT_NOT_ENABLED: "Єдиний вихід (Single Logout) не увімкнено",
	INVALID_LOGOUT_RESPONSE: "Некоректна відповідь про вихід (LogoutResponse)",
	INVALID_LOGOUT_REQUEST: "Некоректний запит про вихід (LogoutRequest)",
	LOGOUT_FAILED_AT_IDP: "Помилка виходу на стороні IdP",
	IDP_SLO_NOT_SUPPORTED:
		"IdP не підтримує службу єдиного виходу (Single Logout)",
	SAML_PROVIDER_NOT_FOUND: "SAML-провайдер не знайдено",
	CERT_SOURCE_MISSING:
		"samlConfig вимагає наявності сертифіката підпису (cert або idpMetadata.cert) або XML-документа idpMetadata.metadata.",
};
