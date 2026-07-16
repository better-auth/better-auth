import type { OAUTH_POPUP_ERROR_CODES } from "better-auth/plugins";
import type { LocalizedTranslations } from "../../../types";

export const esOauthPopup: LocalizedTranslations<
	typeof OAUTH_POPUP_ERROR_CODES
> = {
	POPUP_SIGN_IN_FAILED: "El inicio de sesión emergente falló",
	POPUP_BLOCKED:
		"El navegador bloqueó la ventana emergente de inicio de sesión",
	POPUP_CLOSED:
		"La ventana emergente de inicio de sesión se cerró antes de completarse",
	POPUP_TIMEOUT:
		"La ventana emergente de inicio de sesión agotó el tiempo de espera",
};
