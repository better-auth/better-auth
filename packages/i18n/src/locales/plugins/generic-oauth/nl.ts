import type { GENERIC_OAUTH_ERROR_CODES } from "better-auth/plugins/generic-oauth";
import type { LocalizedTranslations } from "../../../types";

export const nlGenericOAuth: LocalizedTranslations<
	typeof GENERIC_OAUTH_ERROR_CODES
> = {
	INVALID_OAUTH_CONFIGURATION: "Ongeldige OAuth-configuratie",
	TOKEN_URL_NOT_FOUND: "Ongeldige OAuth-configuratie. Token-URL niet gevonden.",
};
