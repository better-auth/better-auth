import type { GENERIC_OAUTH_ERROR_CODES } from "better-auth/plugins/generic-oauth";
import type { LocalizedTranslations } from "../../../types";

export const deGenericOAuth: LocalizedTranslations<
	typeof GENERIC_OAUTH_ERROR_CODES
> = {
	INVALID_OAUTH_CONFIGURATION: "Ungültige OAuth-Konfiguration",
	TOKEN_URL_NOT_FOUND:
		"Ungültige OAuth-Konfiguration. Token-URL nicht gefunden.",
};
