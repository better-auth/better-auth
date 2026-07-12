import type { PASSKEY_ERROR_CODES } from "@better-auth/passkey";
import type { LocalizedTranslations } from "../../../types";

export const ruPasskey: LocalizedTranslations<typeof PASSKEY_ERROR_CODES> = {
	CHALLENGE_NOT_FOUND: "Вызов не найден",
	YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
		"Вам не разрешено регистрировать этот ключ доступа",
	FAILED_TO_VERIFY_REGISTRATION: "Не удалось проверить регистрацию",
	PASSKEY_NOT_FOUND: "Ключ доступа не найден",
	AUTHENTICATION_FAILED: "Ошибка аутентификации",
	UNABLE_TO_CREATE_SESSION: "Не удалось создать сессию",
	FAILED_TO_UPDATE_PASSKEY: "Не удалось обновить ключ доступа",
	PREVIOUSLY_REGISTERED: "Зарегистрирован ранее",
	REGISTRATION_CANCELLED: "Регистрация отменена",
	AUTH_CANCELLED: "Аутентификация отменена",
	UNKNOWN_ERROR: "Неизвестная ошибка",
	SESSION_REQUIRED:
		"Регистрация ключа доступа требует аутентифицированной сессии",
	RESOLVE_USER_REQUIRED:
		"Регистрация ключа доступа требует либо аутентифицированной сессии, либо обратного вызова resolveUser, если requireSession имеет значение false",
	RESOLVED_USER_INVALID: "Разрешенный пользователь недействителен",
};
