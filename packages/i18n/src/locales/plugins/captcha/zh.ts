import type { captcha } from "better-auth/plugins";

type CaptchaErrorCodes = ReturnType<typeof captcha>["$ERROR_CODES"];

import type { LocalizedTranslations } from "../../../types";

export const zhCaptcha: LocalizedTranslations<CaptchaErrorCodes> = {
	VERIFICATION_FAILED: "验证码验证失败",
	MISSING_RESPONSE: "缺少 CAPTCHA 响应",
	UNKNOWN_ERROR: "出现了一些问题",
};
