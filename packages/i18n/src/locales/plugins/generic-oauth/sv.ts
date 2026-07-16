import type { GENERIC_OAUTH_ERROR_CODES } from "better-auth/plugins/generic-oauth";
import type { LocalizedTranslations } from "../../../types";

export const svGenericOAuth: LocalizedTranslations<
	typeof GENERIC_OAUTH_ERROR_CODES
> = {
	INVALID_OAUTH_CONFIGURATION: "Ogiltig OAuth-konfiguration",
	TOKEN_URL_NOT_FOUND: "Ogiltig OAuth-konfiguration. Token-URL hittades inte.",
};
