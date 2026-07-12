import type { GENERIC_OAUTH_ERROR_CODES } from "better-auth/plugins/generic-oauth";
import type { LocalizedTranslations } from "../../../types";

export const itGenericOAuth: LocalizedTranslations<
	typeof GENERIC_OAUTH_ERROR_CODES
> = {
	INVALID_OAUTH_CONFIGURATION: "Configurazione OAuth non valida",
	TOKEN_URL_NOT_FOUND:
		"Configurazione OAuth non valida. URL del token non trovato.",
};
