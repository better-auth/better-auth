import type { SAML_ERROR_CODES } from "@better-auth/sso";
import type { LocalizedTranslations } from "../../../types";

export const koSso: LocalizedTranslations<typeof SAML_ERROR_CODES> = {
	SINGLE_LOGOUT_NOT_ENABLED: "싱글 로그아웃(SLO)이 활성화되어 있지 않습니다",
	INVALID_LOGOUT_RESPONSE: "올바르지 않은 로그아웃 응답(LogoutResponse)입니다",
	INVALID_LOGOUT_REQUEST: "올바르지 않은 로그아웃 요청(LogoutRequest)입니다",
	LOGOUT_FAILED_AT_IDP: "IdP에서 로그아웃에 실패했습니다",
	IDP_SLO_NOT_SUPPORTED: "IdP가 싱글 로그아웃 서비스를 지원하지 않습니다",
	SAML_PROVIDER_NOT_FOUND: "SAML 프로바이더를 찾을 수 없습니다",
	CERT_SOURCE_MISSING:
		"samlConfig 설정을 위해서는 서명 인증서(cert 또는 idpMetadata.cert)나 idpMetadata.metadata XML 문서가 필요합니다.",
};
