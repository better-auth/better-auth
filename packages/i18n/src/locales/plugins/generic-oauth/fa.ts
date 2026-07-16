import type { GENERIC_OAUTH_ERROR_CODES } from "better-auth/plugins/generic-oauth";
import type { LocalizedTranslations } from "../../../types";

export const faGenericOAuth: LocalizedTranslations<
	typeof GENERIC_OAUTH_ERROR_CODES
> = {
	INVALID_OAUTH_CONFIGURATION: "پیکربندی OAuth نامعتبر است",
	TOKEN_URL_NOT_FOUND: "پیکربندی OAuth نامعتبر است. URL توکن یافت نشد.",
};
