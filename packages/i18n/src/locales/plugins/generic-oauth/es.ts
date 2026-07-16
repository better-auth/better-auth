import type { GENERIC_OAUTH_ERROR_CODES } from "better-auth/plugins/generic-oauth";
import type { LocalizedTranslations } from "../../../types";

export const esGenericOAuth: LocalizedTranslations<
	typeof GENERIC_OAUTH_ERROR_CODES
> = {
	INVALID_OAUTH_CONFIGURATION: "Configuración OAuth no válida",
	TOKEN_URL_NOT_FOUND:
		"Configuración OAuth no válida. URL de token no encontrada.",
};
