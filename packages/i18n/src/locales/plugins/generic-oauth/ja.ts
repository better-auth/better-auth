import type { GENERIC_OAUTH_ERROR_CODES } from "better-auth/plugins/generic-oauth";
import type { LocalizedTranslations } from "../../../types";

export const jaGenericOAuth: LocalizedTranslations<
	typeof GENERIC_OAUTH_ERROR_CODES
> = {
	INVALID_OAUTH_CONFIGURATION: "OAuth設定が無効です",
	TOKEN_URL_NOT_FOUND: "OAuth設定が無効です。トークンURLが見つかりません。",
};
