import type { OAUTH_POPUP_ERROR_CODES } from "better-auth/plugins";
import type { LocalizedTranslations } from "../../../types";

export const deOauthPopup: LocalizedTranslations<
	typeof OAUTH_POPUP_ERROR_CODES
> = {
	POPUP_SIGN_IN_FAILED: "Popup-Anmeldung fehlgeschlagen",
	POPUP_BLOCKED: "Das Anmelde-Popup wurde vom Browser blockiert",
	POPUP_CLOSED: "Das Anmelde-Popup wurde vor dem Abschluss geschlossen",
	POPUP_TIMEOUT: "Das Anmelde-Popup hat das Zeitlimit überschritten",
};
