import type { GENERIC_OAUTH_ERROR_CODES } from "better-auth/plugins/generic-oauth";
import type { LocalizedTranslations } from "../../../types";

export const hiGenericOAuth: LocalizedTranslations<
	typeof GENERIC_OAUTH_ERROR_CODES
> = {
	INVALID_OAUTH_CONFIGURATION: "अमान्य OAuth कॉन्फ़िगरेशन",
	TOKEN_URL_NOT_FOUND: "अमान्य OAuth कॉन्फ़िगरेशन। टोकन URL नहीं मिला।",
};
