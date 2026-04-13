import type { TranslationDictionary } from "../types";

/**
 * Russian translations
 */
export const ru: TranslationDictionary = {
	USER_NOT_FOUND: "Пользователь не найден",
	FAILED_TO_CREATE_USER: "Не удалось создать пользователя",
	FAILED_TO_CREATE_SESSION: "Не удалось создать сессию",
	FAILED_TO_UPDATE_USER: "Не удалось обновить пользователя",
	FAILED_TO_GET_SESSION: "Не удалось получить сессию",
	INVALID_PASSWORD: "Неверный пароль",
	INVALID_EMAIL: "Недействительный адрес электронной почты",
	INVALID_EMAIL_OR_PASSWORD: "Неверный адрес электронной почты или пароль",
	INVALID_USER: "Недействительный пользователь",
	SOCIAL_ACCOUNT_ALREADY_LINKED: "Аккаунт в социальной сети уже привязан",
	PROVIDER_NOT_FOUND: "Провайдер не найден",
	INVALID_TOKEN: "Недействительный токен",
	TOKEN_EXPIRED: "Токен истёк",
	FAILED_TO_GET_USER_INFO:
		"Не удалось получить информацию о пользователе",
	USER_EMAIL_NOT_FOUND: "Электронная почта пользователя не найдена",
	EMAIL_NOT_VERIFIED: "Электронная почта не подтверждена",
	PASSWORD_TOO_SHORT: "Пароль слишком короткий",
	PASSWORD_TOO_LONG: "Пароль слишком длинный",
	USER_ALREADY_EXISTS: "Пользователь уже существует",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"Пользователь уже существует. Используйте другой адрес электронной почты.",
	EMAIL_CAN_NOT_BE_UPDATED: "Адрес электронной почты не может быть обновлён",
	CREDENTIAL_ACCOUNT_NOT_FOUND: "Учётная запись с паролем не найдена",
	SESSION_EXPIRED:
		"Сессия истекла. Выполните повторную аутентификацию для выполнения этого действия.",
	FAILED_TO_UNLINK_LAST_ACCOUNT: "Вы не можете отвязать последний аккаунт",
	ACCOUNT_NOT_FOUND: "Аккаунт не найден",
	USER_ALREADY_HAS_PASSWORD:
		"У пользователя уже есть пароль. Укажите его для удаления аккаунта.",
	VERIFICATION_EMAIL_NOT_ENABLED: "Письмо для подтверждения не включено",
	EMAIL_ALREADY_VERIFIED: "Электронная почта уже подтверждена",
	EMAIL_MISMATCH: "Адреса электронной почты не совпадают",
	SESSION_NOT_FRESH: "Сессия устарела",
	LINKED_ACCOUNT_ALREADY_EXISTS: "Привязанный аккаунт уже существует",
	VALIDATION_ERROR: "Ошибка валидации",
	MISSING_FIELD: "Это поле обязательно для заполнения",
	PASSWORD_ALREADY_SET: "У пользователя уже установлен пароль",
};
