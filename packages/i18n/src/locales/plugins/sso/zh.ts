import type { SAML_ERROR_CODES } from "@better-auth/sso";
import type { LocalizedTranslations } from "../../../types";

export const zhSso: LocalizedTranslations<typeof SAML_ERROR_CODES> = {
	SINGLE_LOGOUT_NOT_ENABLED: "单点登出（Single Logout）未启用",
	INVALID_LOGOUT_RESPONSE: "无效的 LogoutResponse",
	INVALID_LOGOUT_REQUEST: "无效的 LogoutRequest",
	LOGOUT_FAILED_AT_IDP: "在身份提供商（IdP）处登出失败",
	IDP_SLO_NOT_SUPPORTED: "身份提供商（IdP）不支持单点登出服务",
	SAML_PROVIDER_NOT_FOUND: "未找到 SAML 提供商",
	CERT_SOURCE_MISSING:
		"samlConfig 需要签名证书（cert 或 idpMetadata.cert）或 idpMetadata.metadata XML 文档。",
};
