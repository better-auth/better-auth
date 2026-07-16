import type { OAUTH_POPUP_ERROR_CODES } from "better-auth/plugins";
import type { LocalizedTranslations } from "../../../types";

export const faOauthPopup: LocalizedTranslations<
	typeof OAUTH_POPUP_ERROR_CODES
> = {
	POPUP_SIGN_IN_FAILED: "ورود از طریق پنجره پاپ‌آپ ناموفق بود",
	POPUP_BLOCKED: "پنجره پاپ‌آپ ورود توسط مرورگر مسدود شد",
	POPUP_CLOSED: "پنجره پاپ‌آپ ورود قبل از تکمیل بسته شد",
	POPUP_TIMEOUT: "پنجره پاپ‌آپ ورود منقضی شد",
};
