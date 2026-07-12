import type { captcha } from "better-auth/plugins";

type CaptchaErrorCodes = ReturnType<typeof captcha>["$ERROR_CODES"];

import type { LocalizedTranslations } from "../../../types";

export const deCaptcha: LocalizedTranslations<CaptchaErrorCodes> = {
	VERIFICATION_FAILED: "Captcha-Überprüfung fehlgeschlagen",
	MISSING_RESPONSE: "CAPTCHA-Antwort fehlt",
	UNKNOWN_ERROR: "Etwas ist schiefgelaufen",
};
