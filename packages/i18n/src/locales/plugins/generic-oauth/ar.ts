import type { GENERIC_OAUTH_ERROR_CODES } from "better-auth/plugins/generic-oauth";
import type { LocalizedTranslations } from "../../../types";

export const arGenericOAuth: LocalizedTranslations<
	typeof GENERIC_OAUTH_ERROR_CODES
> = {
	INVALID_OAUTH_CONFIGURATION: "تكوين OAuth غير صالح",
	TOKEN_URL_NOT_FOUND:
		"تكوين OAuth غير صالح. عنوان URL للرمز المميز غير موجود.",
};
