import type { OAUTH_POPUP_ERROR_CODES } from "better-auth/plugins";
import type { LocalizedTranslations } from "../../../types";

export const hiOauthPopup: LocalizedTranslations<
	typeof OAUTH_POPUP_ERROR_CODES
> = {
	POPUP_SIGN_IN_FAILED: "पॉप-अप साइन-इन विफल हो गया",
	POPUP_BLOCKED: "साइन-इन पॉप-अप ब्राउज़र द्वारा ब्लॉक कर दिया गया",
	POPUP_CLOSED: "साइन-इन पॉप-अप पूरा होने से पहले बंद हो गया",
	POPUP_TIMEOUT: "साइन-इन पॉप-अप का समय समाप्त हो गया",
};
