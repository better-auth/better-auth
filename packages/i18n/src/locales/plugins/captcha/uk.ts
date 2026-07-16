import type { captcha } from "better-auth/plugins";

type CaptchaErrorCodes = ReturnType<typeof captcha>["$ERROR_CODES"];

import type { LocalizedTranslations } from "../../../types";

export const ukCaptcha: LocalizedTranslations<CaptchaErrorCodes> = {
	VERIFICATION_FAILED: "Перевірка капчі не вдалася",
	MISSING_RESPONSE: "Відповідь CAPTCHA відсутня",
	UNKNOWN_ERROR: "Щось пішло не так",
};
