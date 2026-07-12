import type { captcha } from "better-auth/plugins";

type CaptchaErrorCodes = ReturnType<typeof captcha>["$ERROR_CODES"];

import type { LocalizedTranslations } from "../../../types";

export const jaCaptcha: LocalizedTranslations<CaptchaErrorCodes> = {
	VERIFICATION_FAILED: "Captchaの検証に失敗しました",
	MISSING_RESPONSE: "CAPTCHAの回答がありません",
	UNKNOWN_ERROR: "問題が発生しました",
};
