import type { ELECTRON_ERROR_CODES } from "@better-auth/electron";
import type { LocalizedTranslations } from "../../../types";

export const ukElectron: LocalizedTranslations<typeof ELECTRON_ERROR_CODES> = {
	INVALID_CLIENT_ID: "Некоректний ідентифікатор клієнта",
	INVALID_TOKEN: "Некоректний або прострочений токен.",
	STATE_MISMATCH: "Невідповідність стану (state mismatch)",
	MISSING_CODE_CHALLENGE: "Відсутній кодовий виклик (code challenge)",
	INVALID_CODE_VERIFIER: "Некоректний верифікатор коду",
	MISSING_STATE: "Стан (state) є обов'язковим",
	MISSING_PKCE: "Потрібно PKCE",
};
