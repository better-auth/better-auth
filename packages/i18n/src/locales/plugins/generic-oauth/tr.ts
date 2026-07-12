import type { GENERIC_OAUTH_ERROR_CODES } from "better-auth/plugins/generic-oauth";
import type { LocalizedTranslations } from "../../../types";

export const trGenericOAuth: LocalizedTranslations<
	typeof GENERIC_OAUTH_ERROR_CODES
> = {
	INVALID_OAUTH_CONFIGURATION: "Geçersiz OAuth yapılandırması",
	TOKEN_URL_NOT_FOUND:
		"Geçersiz OAuth yapılandırması. Token URL'si bulunamadı.",
};
