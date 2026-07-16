import type { captcha } from "better-auth/plugins";

type CaptchaErrorCodes = ReturnType<typeof captcha>["$ERROR_CODES"];

import type { LocalizedTranslations } from "../../../types";

export const ptCaptcha: LocalizedTranslations<CaptchaErrorCodes> = {
	VERIFICATION_FAILED: "A verificação do captcha falhou",
	MISSING_RESPONSE: "Resposta do CAPTCHA ausente",
	UNKNOWN_ERROR: "Algo deu errado",
};
