import type { captcha } from "better-auth/plugins";

type CaptchaErrorCodes = ReturnType<typeof captcha>["$ERROR_CODES"];

import type { LocalizedTranslations } from "../../../types";

export const hiCaptcha: LocalizedTranslations<CaptchaErrorCodes> = {
	VERIFICATION_FAILED: "कैप्चा सत्यापन विफल हो गया",
	MISSING_RESPONSE: "CAPTCHA प्रतिक्रिया अनुपस्थित है",
	UNKNOWN_ERROR: "कुछ गलत हो गया",
};
