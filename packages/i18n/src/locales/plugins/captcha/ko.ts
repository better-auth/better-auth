import type { captcha } from "better-auth/plugins";

type CaptchaErrorCodes = ReturnType<typeof captcha>["$ERROR_CODES"];

import type { LocalizedTranslations } from "../../../types";

export const koCaptcha: LocalizedTranslations<CaptchaErrorCodes> = {
	VERIFICATION_FAILED: "캡차 인증에 실패했습니다",
	MISSING_RESPONSE: "CAPTCHA 응답이 없습니다",
	UNKNOWN_ERROR: "문제가 발생했습니다",
};
