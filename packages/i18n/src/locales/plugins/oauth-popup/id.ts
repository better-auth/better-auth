import type { OAUTH_POPUP_ERROR_CODES } from "better-auth/plugins";
import type { LocalizedTranslations } from "../../../types";

export const idOauthPopup: LocalizedTranslations<
	typeof OAUTH_POPUP_ERROR_CODES
> = {
	POPUP_SIGN_IN_FAILED: "Masuk melalui popup gagal",
	POPUP_BLOCKED: "Popup masuk diblokir oleh browser",
	POPUP_CLOSED: "Popup masuk ditutup sebelum selesai",
	POPUP_TIMEOUT: "Popup masuk telah habis waktu",
};
