import type { OAUTH_POPUP_ERROR_CODES } from "better-auth/plugins";
import type { LocalizedTranslations } from "../../../types";

export const frOauthPopup: LocalizedTranslations<
	typeof OAUTH_POPUP_ERROR_CODES
> = {
	POPUP_SIGN_IN_FAILED: "La connexion via la fenêtre contextuelle a échoué",
	POPUP_BLOCKED:
		"La fenêtre contextuelle de connexion a été bloquée par le navigateur",
	POPUP_CLOSED:
		"La fenêtre contextuelle de connexion a été fermée avant d'être complétée",
	POPUP_TIMEOUT: "La fenêtre contextuelle de connexion a expiré",
};
