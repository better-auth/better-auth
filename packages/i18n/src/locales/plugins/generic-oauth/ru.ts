import type { GENERIC_OAUTH_ERROR_CODES } from "better-auth/plugins/generic-oauth";
import type { LocalizedTranslations } from "../../../types";

export const ruGenericOAuth: LocalizedTranslations<
	typeof GENERIC_OAUTH_ERROR_CODES
> = {
	INVALID_OAUTH_CONFIGURATION: "Неверная конфигурация OAuth",
	TOKEN_URL_NOT_FOUND: "Неверная конфигурация OAuth. URL токена не найден.",
};
