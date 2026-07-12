import type { captcha } from "better-auth/plugins";

type CaptchaErrorCodes = ReturnType<typeof captcha>["$ERROR_CODES"];

import type { LocalizedTranslations } from "../../../types";

export const viCaptcha: LocalizedTranslations<CaptchaErrorCodes> = {
	VERIFICATION_FAILED: "Xác minh captcha thất bại",
	MISSING_RESPONSE: "Thiếu phản hồi CAPTCHA",
	UNKNOWN_ERROR: "Đã xảy ra lỗi",
};
