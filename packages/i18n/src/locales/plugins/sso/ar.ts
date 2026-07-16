import type { SAML_ERROR_CODES } from "@better-auth/sso";
import type { LocalizedTranslations } from "../../../types";

export const arSso: LocalizedTranslations<typeof SAML_ERROR_CODES> = {
	SINGLE_LOGOUT_NOT_ENABLED: "تسجيل الخروج الموحد غير مفعل",
	INVALID_LOGOUT_RESPONSE: "استجابة تسجيل خروج غير صالحة",
	INVALID_LOGOUT_REQUEST: "طلب تسجيل خروج غير صالح",
	LOGOUT_FAILED_AT_IDP: "فشل تسجيل الخروج عند موفر الهوية (IdP)",
	IDP_SLO_NOT_SUPPORTED: "لا يدعم موفر الهوية (IdP) خدمة تسجيل الخروج الموحد",
	SAML_PROVIDER_NOT_FOUND: "موفر SAML غير موجود",
	CERT_SOURCE_MISSING:
		"يتطلب samlConfig إما شهادة توقيع (cert أو idpMetadata.cert) أو مستند XML لـ idpMetadata.metadata.",
};
