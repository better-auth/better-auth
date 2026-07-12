import type { captcha } from "better-auth/plugins";

type CaptchaErrorCodes = ReturnType<typeof captcha>["$ERROR_CODES"];

import type { LocalizedTranslations } from "../../../types";

export const faCaptcha: LocalizedTranslations<CaptchaErrorCodes> = {
	VERIFICATION_FAILED: "تأیید کپچا ناموفق بود",
	MISSING_RESPONSE: "پاسخ CAPTCHA وجود ندارد",
	UNKNOWN_ERROR: "مشکلی پیش آمده است",
};
