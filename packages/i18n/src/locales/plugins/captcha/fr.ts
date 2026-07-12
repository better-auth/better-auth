import type { captcha } from "better-auth/plugins";

type CaptchaErrorCodes = ReturnType<typeof captcha>["$ERROR_CODES"];

import type { LocalizedTranslations } from "../../../types";

export const frCaptcha: LocalizedTranslations<CaptchaErrorCodes> = {
	VERIFICATION_FAILED: "La vérification du captcha a échoué",
	MISSING_RESPONSE: "Réponse CAPTCHA manquante",
	UNKNOWN_ERROR: "Une erreur s'est produite",
};
