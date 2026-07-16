import type { SAML_ERROR_CODES } from "@better-auth/sso";
import type { LocalizedTranslations } from "../../../types";

export const viSso: LocalizedTranslations<typeof SAML_ERROR_CODES> = {
	SINGLE_LOGOUT_NOT_ENABLED:
		"Đăng xuất một lần (Single Logout) chưa được kích hoạt",
	INVALID_LOGOUT_RESPONSE: "LogoutResponse không hợp lệ",
	INVALID_LOGOUT_REQUEST: "LogoutRequest không hợp lệ",
	LOGOUT_FAILED_AT_IDP: "Đăng xuất thất bại tại IdP",
	IDP_SLO_NOT_SUPPORTED: "IdP không hỗ trợ dịch vụ Đăng xuất một lần",
	SAML_PROVIDER_NOT_FOUND: "Không tìm thấy nhà cung cấp SAML",
	CERT_SOURCE_MISSING:
		"samlConfig yêu cầu chứng chỉ ký (cert hoặc idpMetadata.cert) hoặc tài liệu XML idpMetadata.metadata.",
};
