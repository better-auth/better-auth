import type { OAUTH_POPUP_ERROR_CODES } from "better-auth/plugins";
import type { LocalizedTranslations } from "../../../types";

export const plOauthPopup: LocalizedTranslations<
	typeof OAUTH_POPUP_ERROR_CODES
> = {
	POPUP_SIGN_IN_FAILED: "Logowanie przez wyskakujące okno nie powiodło się",
	POPUP_BLOCKED:
		"Wyskakujące okno logowania zostało zablokowane przez przeglądarkę",
	POPUP_CLOSED:
		"Wyskakujące okno logowania zostało zamknięte przed ukończeniem",
	POPUP_TIMEOUT: "Wyskakujące okno logowania przekroczyło limit czasu",
};
