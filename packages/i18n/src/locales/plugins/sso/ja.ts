import type { SAML_ERROR_CODES } from "@better-auth/sso";
import type { LocalizedTranslations } from "../../../types";

export const jaSso: LocalizedTranslations<typeof SAML_ERROR_CODES> = {
	SINGLE_LOGOUT_NOT_ENABLED: "シングルログアウト（SLO）が有効になっていません",
	INVALID_LOGOUT_RESPONSE: "無効なLogoutResponseです",
	INVALID_LOGOUT_REQUEST: "無効なLogoutRequestです",
	LOGOUT_FAILED_AT_IDP: "IdPでのログアウトに失敗しました",
	IDP_SLO_NOT_SUPPORTED:
		"IdPはシングルログアウトサービスをサポートしていません",
	SAML_PROVIDER_NOT_FOUND: "SAMLプロバイダーが見つかりません",
	CERT_SOURCE_MISSING:
		"samlConfigには署名証明書（certまたはidpMetadata.cert）か、idpMetadata.metadata XMLドキュメントのいずれかが必要です。",
};
