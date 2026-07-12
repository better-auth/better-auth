import type { SAML_ERROR_CODES } from "@better-auth/sso";
import type { LocalizedTranslations } from "../../../types";

export const faSso: LocalizedTranslations<typeof SAML_ERROR_CODES> = {
	SINGLE_LOGOUT_NOT_ENABLED: "خروج یکپارچه فعال نیست",
	INVALID_LOGOUT_RESPONSE: "LogoutResponse نامعتبر است",
	INVALID_LOGOUT_REQUEST: "LogoutRequest نامعتبر است",
	LOGOUT_FAILED_AT_IDP: "خروج در IdP با خطا مواجه شد",
	IDP_SLO_NOT_SUPPORTED:
		"موفر هویت (IdP) از سرویس خروج یکپارچه پشتیبانی نمی‌کند",
	SAML_PROVIDER_NOT_FOUND: "ارائه‌دهنده SAML یافت نشد",
	CERT_SOURCE_MISSING:
		"تنظیمات samlConfig به یک گواهی امضا (cert یا idpMetadata.cert) یا سند XML از نوع idpMetadata.metadata نیاز دارد.",
};
