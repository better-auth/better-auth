import type { SAML_ERROR_CODES } from "@better-auth/sso";
import type { LocalizedTranslations } from "../../../types";

export const trSso: LocalizedTranslations<typeof SAML_ERROR_CODES> = {
	SINGLE_LOGOUT_NOT_ENABLED: "Tekli Oturum Kapatma etkinleştirilmemiş",
	INVALID_LOGOUT_RESPONSE: "Geçersiz LogoutResponse",
	INVALID_LOGOUT_REQUEST: "Geçersiz LogoutRequest",
	LOGOUT_FAILED_AT_IDP: "Kimlik Sağlayıcıda (IdP) oturum kapatılamadı",
	IDP_SLO_NOT_SUPPORTED:
		"Kimlik Sağlayıcı (IdP) Tekli Oturum Kapatma Hizmetini desteklemiyor",
	SAML_PROVIDER_NOT_FOUND: "SAML sağlayıcısı bulunamadı",
	CERT_SOURCE_MISSING:
		"samlConfig imzalama sertifikası (cert veya idpMetadata.cert) veya idpMetadata.metadata XML belgesi gerektirir.",
};
