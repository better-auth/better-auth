import type { OAUTH_POPUP_ERROR_CODES } from "better-auth/plugins";
import type { LocalizedTranslations } from "../../../types";

export const ruOauthPopup: LocalizedTranslations<
	typeof OAUTH_POPUP_ERROR_CODES
> = {
	POPUP_SIGN_IN_FAILED: "Вход через всплывающее окно не удался",
	POPUP_BLOCKED: "Всплывающее окно входа было заблокировано браузером",
	POPUP_CLOSED: "Всплывающее окно входа было закрыто до завершения",
	POPUP_TIMEOUT: "Время ожидания всплывающего окна входа истекло",
};
