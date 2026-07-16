import type { GENERIC_OAUTH_ERROR_CODES } from "better-auth/plugins/generic-oauth";
import type { LocalizedTranslations } from "../../../types";

export const frGenericOAuth: LocalizedTranslations<
	typeof GENERIC_OAUTH_ERROR_CODES
> = {
	INVALID_OAUTH_CONFIGURATION: "Configuration OAuth invalide",
	TOKEN_URL_NOT_FOUND:
		"Configuration OAuth invalide. URL du token introuvable.",
};
