import type { GENERIC_OAUTH_ERROR_CODES } from "better-auth/plugins/generic-oauth";
import type { LocalizedTranslations } from "../../../types";

export const koGenericOAuth: LocalizedTranslations<
	typeof GENERIC_OAUTH_ERROR_CODES
> = {
	INVALID_OAUTH_CONFIGURATION: "유효하지 않은 OAuth 구성",
	TOKEN_URL_NOT_FOUND: "유효하지 않은 OAuth 구성. 토큰 URL을 찾을 수 없습니다.",
};
