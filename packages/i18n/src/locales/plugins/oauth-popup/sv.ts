import type { OAUTH_POPUP_ERROR_CODES } from "better-auth/plugins";
import type { LocalizedTranslations } from "../../../types";

export const svOauthPopup: LocalizedTranslations<
	typeof OAUTH_POPUP_ERROR_CODES
> = {
	POPUP_SIGN_IN_FAILED: "Popup-inloggning misslyckades",
	POPUP_BLOCKED: "Popup-inloggningsfönstret blockerades av webbläsaren",
	POPUP_CLOSED: "Popup-inloggningsfönstret stängdes innan det slutfördes",
	POPUP_TIMEOUT: "Popup-inloggningsfönstret tog för lång tid",
};
