import type { OAUTH_POPUP_ERROR_CODES } from "better-auth/plugins";
import type { LocalizedTranslations } from "../../../types";

export const ukOauthPopup: LocalizedTranslations<
	typeof OAUTH_POPUP_ERROR_CODES
> = {
	POPUP_SIGN_IN_FAILED: "Вхід через спливаюче вікно не вдався",
	POPUP_BLOCKED: "Спливаюче вікно входу було заблоковано браузером",
	POPUP_CLOSED: "Спливаюче вікно входу було закрито до завершення",
	POPUP_TIMEOUT: "Час очікування спливаючого вікна входу минув",
};
