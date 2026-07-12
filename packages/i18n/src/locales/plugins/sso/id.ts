import type { SAML_ERROR_CODES } from "@better-auth/sso";
import type { LocalizedTranslations } from "../../../types";

export const idSso: LocalizedTranslations<typeof SAML_ERROR_CODES> = {
	SINGLE_LOGOUT_NOT_ENABLED: "Single Logout tidak diaktifkan",
	INVALID_LOGOUT_RESPONSE: "LogoutResponse tidak valid",
	INVALID_LOGOUT_REQUEST: "LogoutRequest tidak valid",
	LOGOUT_FAILED_AT_IDP: "Logout gagal di IdP",
	IDP_SLO_NOT_SUPPORTED: "IdP tidak mendukung Layanan Single Logout",
	SAML_PROVIDER_NOT_FOUND: "Penyedia SAML tidak ditemukan",
	CERT_SOURCE_MISSING:
		"samlConfig memerlukan sertifikat penandatanganan (cert atau idpMetadata.cert) atau dokumen XML idpMetadata.metadata.",
};
