import type { OAUTH_POPUP_ERROR_CODES } from "better-auth/plugins";
import type { LocalizedTranslations } from "../../../types";

export const trOauthPopup: LocalizedTranslations<
	typeof OAUTH_POPUP_ERROR_CODES
> = {
	POPUP_SIGN_IN_FAILED: "Açılır pencere ile oturum açma başarısız oldu",
	POPUP_BLOCKED: "Oturum açma açılır penceresi tarayıcı tarafından engellendi",
	POPUP_CLOSED: "Oturum açma açılır penceresi tamamlanmadan kapatıldı",
	POPUP_TIMEOUT: "Oturum açma açılır penceresi zaman aşımına uğradı",
};
