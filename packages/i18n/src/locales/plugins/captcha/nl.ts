import type { captcha } from "better-auth/plugins";

type CaptchaErrorCodes = ReturnType<typeof captcha>["$ERROR_CODES"];

import type { LocalizedTranslations } from "../../../types";

export const nlCaptcha: LocalizedTranslations<CaptchaErrorCodes> = {
	VERIFICATION_FAILED: "Captcha-verificatie mislukt",
	MISSING_RESPONSE: "CAPTCHA-antwoord ontbreekt",
	UNKNOWN_ERROR: "Er is iets misgegaan",
};
