import type { OAUTH_POPUP_ERROR_CODES } from "better-auth/plugins";
import type { LocalizedTranslations } from "../../../types";

export const nlOauthPopup: LocalizedTranslations<
	typeof OAUTH_POPUP_ERROR_CODES
> = {
	POPUP_SIGN_IN_FAILED: "Inloggen via pop-up mislukt",
	POPUP_BLOCKED: "Het inlogpop-up werd geblokkeerd door de browser",
	POPUP_CLOSED: "Het inlogpop-up werd gesloten voordat het voltooid was",
	POPUP_TIMEOUT: "Het inlogpop-up is verlopen",
};
