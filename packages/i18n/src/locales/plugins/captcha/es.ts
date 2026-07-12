import type { captcha } from "better-auth/plugins";

type CaptchaErrorCodes = ReturnType<typeof captcha>["$ERROR_CODES"];

import type { LocalizedTranslations } from "../../../types";

export const esCaptcha: LocalizedTranslations<CaptchaErrorCodes> = {
	VERIFICATION_FAILED: "La verificación del captcha falló",
	MISSING_RESPONSE: "Falta la respuesta del CAPTCHA",
	UNKNOWN_ERROR: "Algo salió mal",
};
