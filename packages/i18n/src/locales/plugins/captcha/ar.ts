import type { captcha } from "better-auth/plugins";

type CaptchaErrorCodes = ReturnType<typeof captcha>["$ERROR_CODES"];

import type { LocalizedTranslations } from "../../../types";

export const arCaptcha: LocalizedTranslations<CaptchaErrorCodes> = {
	VERIFICATION_FAILED: "فشل التحقق من الكابتشا",
	MISSING_RESPONSE: "استجابة CAPTCHA مفقودة",
	UNKNOWN_ERROR: "حدث خطأ ما",
};
