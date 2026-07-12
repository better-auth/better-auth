import type { GENERIC_OAUTH_ERROR_CODES } from "better-auth/plugins/generic-oauth";
import type { LocalizedTranslations } from "../../../types";

export const ukGenericOAuth: LocalizedTranslations<
	typeof GENERIC_OAUTH_ERROR_CODES
> = {
	INVALID_OAUTH_CONFIGURATION: "Неправильна конфігурація OAuth",
	TOKEN_URL_NOT_FOUND:
		"Неправильна конфігурація OAuth. URL токену не знайдено.",
};
