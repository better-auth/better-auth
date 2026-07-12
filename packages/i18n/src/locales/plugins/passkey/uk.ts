import type { PASSKEY_ERROR_CODES } from "@better-auth/passkey";
import type { LocalizedTranslations } from "../../../types";

export const ukPasskey: LocalizedTranslations<typeof PASSKEY_ERROR_CODES> = {
	CHALLENGE_NOT_FOUND: "Запит не знайдено",
	YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
		"Вам не дозволено реєструвати цей ключ доступу",
	FAILED_TO_VERIFY_REGISTRATION: "Не вдалося перевірити реєстрацію",
	PASSKEY_NOT_FOUND: "Ключ доступу не знайдено",
	AUTHENTICATION_FAILED: "Помилка автентифікації",
	UNABLE_TO_CREATE_SESSION: "Не вдалося створити сесію",
	FAILED_TO_UPDATE_PASSKEY: "Не вдалося оновити ключ доступу",
	PREVIOUSLY_REGISTERED: "Зареєстровано раніше",
	REGISTRATION_CANCELLED: "Реєстрацію скасовано",
	AUTH_CANCELLED: "Автентифікацію скасовано",
	UNKNOWN_ERROR: "Невідома помилка",
	SESSION_REQUIRED: "Реєстрація ключа доступу потребує автентифікованої сесії",
	RESOLVE_USER_REQUIRED:
		"Реєстрація ключа доступу потребує або автентифікованої сесії, або функції зворотного виклику resolveUser, якщо requireSession має значення false",
	RESOLVED_USER_INVALID: "Визначений користувач недійсний",
};
