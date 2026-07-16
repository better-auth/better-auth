import type { SAML_ERROR_CODES } from "@better-auth/sso";
import type { LocalizedTranslations } from "../../../types";

export const thSso: LocalizedTranslations<typeof SAML_ERROR_CODES> = {
	SINGLE_LOGOUT_NOT_ENABLED:
		"ไม่ได้เปิดใช้งานระบบออกจากระบบครั้งเดียว (Single Logout)",
	INVALID_LOGOUT_RESPONSE: "LogoutResponse ไม่ถูกต้อง",
	INVALID_LOGOUT_REQUEST: "LogoutRequest ไม่ถูกต้อง",
	LOGOUT_FAILED_AT_IDP: "ออกจากระบบล้มเหลวที่ผู้ให้บริการยืนยันตัวตน (IdP)",
	IDP_SLO_NOT_SUPPORTED: "IdP ไม่สนับสนุนบริการออกจากระบบครั้งเดียว",
	SAML_PROVIDER_NOT_FOUND: "ไม่พบผู้ให้บริการ SAML",
	CERT_SOURCE_MISSING:
		"samlConfig จำเป็นต้องระบุใบรับรองการลงนาม (cert หรือ idpMetadata.cert) หรือเอกสาร XML idpMetadata.metadata",
};
