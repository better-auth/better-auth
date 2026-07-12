import type { OAUTH_POPUP_ERROR_CODES } from "better-auth/plugins";
import type { LocalizedTranslations } from "../../../types";

export const ptOauthPopup: LocalizedTranslations<
	typeof OAUTH_POPUP_ERROR_CODES
> = {
	POPUP_SIGN_IN_FAILED: "O login via popup falhou",
	POPUP_BLOCKED: "O popup de login foi bloqueado pelo navegador",
	POPUP_CLOSED: "O popup de login foi fechado antes de ser concluído",
	POPUP_TIMEOUT: "O popup de login expirou",
};
