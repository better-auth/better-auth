import type { GENERIC_OAUTH_ERROR_CODES } from "better-auth/plugins/generic-oauth";
import type { LocalizedTranslations } from "../../../types";

export const thGenericOAuth: LocalizedTranslations<
	typeof GENERIC_OAUTH_ERROR_CODES
> = {
	INVALID_OAUTH_CONFIGURATION: "การกำหนดค่า OAuth ไม่ถูกต้อง",
	TOKEN_URL_NOT_FOUND: "การกำหนดค่า OAuth ไม่ถูกต้อง ไม่พบ URL ของโทเค็น",
};
