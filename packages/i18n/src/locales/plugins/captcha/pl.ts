import type { captcha } from "better-auth/plugins";

type CaptchaErrorCodes = ReturnType<typeof captcha>["$ERROR_CODES"];

import type { LocalizedTranslations } from "../../../types";

export const plCaptcha: LocalizedTranslations<CaptchaErrorCodes> = {
	VERIFICATION_FAILED: "Weryfikacja captcha nie powiodła się",
	MISSING_RESPONSE: "Brak odpowiedzi CAPTCHA",
	UNKNOWN_ERROR: "Coś poszło nie tak",
};
