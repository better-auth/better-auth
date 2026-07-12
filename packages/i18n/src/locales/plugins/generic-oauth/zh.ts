import type { GENERIC_OAUTH_ERROR_CODES } from "better-auth/plugins/generic-oauth";
import type { LocalizedTranslations } from "../../../types";

export const zhGenericOAuth: LocalizedTranslations<
	typeof GENERIC_OAUTH_ERROR_CODES
> = {
	INVALID_OAUTH_CONFIGURATION: "无效的 OAuth 配置",
	TOKEN_URL_NOT_FOUND: "无效的 OAuth 配置。未找到令牌 URL。",
};
