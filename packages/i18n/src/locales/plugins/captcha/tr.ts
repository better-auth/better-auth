import type { captcha } from "better-auth/plugins";

type CaptchaErrorCodes = ReturnType<typeof captcha>["$ERROR_CODES"];

import type { LocalizedTranslations } from "../../../types";

export const trCaptcha: LocalizedTranslations<CaptchaErrorCodes> = {
	VERIFICATION_FAILED: "Captcha doğrulaması başarısız oldu",
	MISSING_RESPONSE: "CAPTCHA yanıtı eksik",
	UNKNOWN_ERROR: "Bir şeyler ters gitti",
};
