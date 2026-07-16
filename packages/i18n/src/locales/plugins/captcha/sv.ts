import type { captcha } from "better-auth/plugins";

type CaptchaErrorCodes = ReturnType<typeof captcha>["$ERROR_CODES"];

import type { LocalizedTranslations } from "../../../types";

export const svCaptcha: LocalizedTranslations<CaptchaErrorCodes> = {
	VERIFICATION_FAILED: "Captcha-verifieringen misslyckades",
	MISSING_RESPONSE: "CAPTCHA-svar saknas",
	UNKNOWN_ERROR: "Något gick fel",
};
