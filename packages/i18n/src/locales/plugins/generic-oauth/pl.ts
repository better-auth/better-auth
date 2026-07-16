import type { GENERIC_OAUTH_ERROR_CODES } from "better-auth/plugins/generic-oauth";
import type { LocalizedTranslations } from "../../../types";

export const plGenericOAuth: LocalizedTranslations<
	typeof GENERIC_OAUTH_ERROR_CODES
> = {
	INVALID_OAUTH_CONFIGURATION: "Nieprawidłowa konfiguracja OAuth",
	TOKEN_URL_NOT_FOUND:
		"Nieprawidłowa konfiguracja OAuth. Nie znaleziono adresu URL tokenu.",
};
