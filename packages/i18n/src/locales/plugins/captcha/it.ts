import type { captcha } from "better-auth/plugins";

type CaptchaErrorCodes = ReturnType<typeof captcha>["$ERROR_CODES"];

import type { LocalizedTranslations } from "../../../types";

export const itCaptcha: LocalizedTranslations<CaptchaErrorCodes> = {
	VERIFICATION_FAILED: "Verifica captcha non riuscita",
	MISSING_RESPONSE: "Risposta CAPTCHA mancante",
	UNKNOWN_ERROR: "Qualcosa è andato storto",
};
