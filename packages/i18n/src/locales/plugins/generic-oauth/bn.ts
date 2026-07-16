import type { GENERIC_OAUTH_ERROR_CODES } from "better-auth/plugins/generic-oauth";
import type { LocalizedTranslations } from "../../../types";

export const bnGenericOAuth: LocalizedTranslations<
	typeof GENERIC_OAUTH_ERROR_CODES
> = {
	INVALID_OAUTH_CONFIGURATION: "অবৈধ OAuth কনফিগারেশন",
	TOKEN_URL_NOT_FOUND: "অবৈধ OAuth কনফিগারেশন। টোকেন URL পাওয়া যায়নি।",
};
