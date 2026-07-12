import type { captcha } from "better-auth/plugins";

type CaptchaErrorCodes = ReturnType<typeof captcha>["$ERROR_CODES"];

import type { LocalizedTranslations } from "../../../types";

export const bnCaptcha: LocalizedTranslations<CaptchaErrorCodes> = {
	VERIFICATION_FAILED: "ক্যাপচা যাচাইকরণ ব্যর্থ হয়েছে",
	MISSING_RESPONSE: "CAPTCHA উত্তর অনুপস্থিত",
	UNKNOWN_ERROR: "কিছু একটা ভুল হয়েছে",
};
