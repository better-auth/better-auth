import type { GENERIC_OAUTH_ERROR_CODES } from "better-auth/plugins/generic-oauth";
import type { LocalizedTranslations } from "../../../types";

export const ptGenericOAuth: LocalizedTranslations<
	typeof GENERIC_OAUTH_ERROR_CODES
> = {
	INVALID_OAUTH_CONFIGURATION: "Configuração OAuth inválida",
	TOKEN_URL_NOT_FOUND:
		"Configuração OAuth inválida. URL do token não encontrada.",
};
