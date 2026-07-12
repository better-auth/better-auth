import type { OAUTH_POPUP_ERROR_CODES } from "better-auth/plugins";
import type { LocalizedTranslations } from "../../../types";

export const enOauthPopup: LocalizedTranslations<
	typeof OAUTH_POPUP_ERROR_CODES
> = {
	POPUP_SIGN_IN_FAILED: "Popup sign-in failed",
	POPUP_BLOCKED: "Sign-in popup was blocked by the browser",
	POPUP_CLOSED: "Sign-in popup was closed before completing",
	POPUP_TIMEOUT: "Sign-in popup timed out",
};
