import type { OAUTH_POPUP_ERROR_CODES } from "better-auth/plugins";
import type { LocalizedTranslations } from "../../../types";

export const itOauthPopup: LocalizedTranslations<
	typeof OAUTH_POPUP_ERROR_CODES
> = {
	POPUP_SIGN_IN_FAILED: "Accesso tramite popup non riuscito",
	POPUP_BLOCKED: "Il popup di accesso è stato bloccato dal browser",
	POPUP_CLOSED: "Il popup di accesso è stato chiuso prima del completamento",
	POPUP_TIMEOUT: "Il popup di accesso è scaduto",
};
