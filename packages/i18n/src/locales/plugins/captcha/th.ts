import type { captcha } from "better-auth/plugins";

type CaptchaErrorCodes = ReturnType<typeof captcha>["$ERROR_CODES"];

import type { LocalizedTranslations } from "../../../types";

export const thCaptcha: LocalizedTranslations<CaptchaErrorCodes> = {
	VERIFICATION_FAILED: "การยืนยัน Captcha ล้มเหลว",
	MISSING_RESPONSE: "ไม่มีการตอบสนอง CAPTCHA",
	UNKNOWN_ERROR: "เกิดข้อผิดพลาดบางอย่าง",
};
