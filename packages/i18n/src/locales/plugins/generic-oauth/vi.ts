import type { GENERIC_OAUTH_ERROR_CODES } from "better-auth/plugins/generic-oauth";
import type { LocalizedTranslations } from "../../../types";

export const viGenericOAuth: LocalizedTranslations<
	typeof GENERIC_OAUTH_ERROR_CODES
> = {
	INVALID_OAUTH_CONFIGURATION: "Cấu hình OAuth không hợp lệ",
	TOKEN_URL_NOT_FOUND: "Cấu hình OAuth không hợp lệ. Không tìm thấy URL token.",
};
