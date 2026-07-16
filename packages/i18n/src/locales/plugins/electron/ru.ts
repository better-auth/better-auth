import type { ELECTRON_ERROR_CODES } from "@better-auth/electron";
import type { LocalizedTranslations } from "../../../types";

export const ruElectron: LocalizedTranslations<typeof ELECTRON_ERROR_CODES> = {
	INVALID_CLIENT_ID: "Неверный идентификатор клиента",
	INVALID_TOKEN: "Неверный или истекший токен.",
	STATE_MISMATCH: "Несоответствие состояния (state mismatch)",
	MISSING_CODE_CHALLENGE: "Отсутствует кодовый вызов (code challenge)",
	INVALID_CODE_VERIFIER: "Неверный верификатор кода",
	MISSING_STATE: "Состояние (state) является обязательным",
	MISSING_PKCE: "Требуется PKCE",
};
