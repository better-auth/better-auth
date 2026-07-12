import type { GENERIC_OAUTH_ERROR_CODES } from "better-auth/plugins/generic-oauth";
import type { LocalizedTranslations } from "../../../types";

export const idGenericOAuth: LocalizedTranslations<
	typeof GENERIC_OAUTH_ERROR_CODES
> = {
	INVALID_OAUTH_CONFIGURATION: "Konfigurasi OAuth tidak valid",
	TOKEN_URL_NOT_FOUND:
		"Konfigurasi OAuth tidak valid. URL token tidak ditemukan.",
};
