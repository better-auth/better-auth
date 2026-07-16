import type { captcha } from "better-auth/plugins";

type CaptchaErrorCodes = ReturnType<typeof captcha>["$ERROR_CODES"];

import type { LocalizedTranslations } from "../../../types";

export const ruCaptcha: LocalizedTranslations<CaptchaErrorCodes> = {
	VERIFICATION_FAILED: "Проверка капчи не удалась",
	MISSING_RESPONSE: "Отсутствует ответ CAPTCHA",
	UNKNOWN_ERROR: "Что-то пошло не так",
};
