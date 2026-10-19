import type { TranslationDictionary } from "../types";

/**
 * Ukrainian translations
 */
export const uk: TranslationDictionary = {
	USER_NOT_FOUND: "Користувача не знайдено",
	FAILED_TO_CREATE_USER: "Не вдалося створити користувача",
	FAILED_TO_CREATE_SESSION: "Не вдалося створити сеанс",
	FAILED_TO_UPDATE_USER: "Не вдалося оновити користувача",
	FAILED_TO_GET_SESSION: "Не вдалося отримати сеанс",
	INVALID_PASSWORD: "Неправильний пароль",
	INVALID_EMAIL: "Недійсна адреса електронної пошти",
	INVALID_EMAIL_OR_PASSWORD: "Неправильна адреса електронної пошти або пароль",
	INVALID_USER: "Недійсний користувач",
	SOCIAL_ACCOUNT_ALREADY_LINKED: "Соціальний акаунт вже прив'язано",
	PROVIDER_NOT_FOUND: "Провайдера не знайдено",
	INVALID_TOKEN: "Недійсний токен",
	TOKEN_EXPIRED: "Термін дії токена закінчився",
	FAILED_TO_GET_USER_INFO: "Не вдалося отримати інформацію про користувача",
	USER_EMAIL_NOT_FOUND: "Адресу електронної пошти користувача не знайдено",
	EMAIL_NOT_VERIFIED: "Адресу електронної пошти не підтверджено",
	PASSWORD_TOO_SHORT: "Пароль занадто короткий",
	PASSWORD_TOO_LONG: "Пароль занадто довгий",
	USER_ALREADY_EXISTS: "Користувач вже існує",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"Користувач вже існує. Використовуйте іншу адресу електронної пошти.",
	EMAIL_CAN_NOT_BE_UPDATED: "Адресу електронної пошти не можна оновити",
	CREDENTIAL_ACCOUNT_NOT_FOUND: "Обліковий запис із даними не знайдено",
	SESSION_EXPIRED:
		"Сеанс закінчився. Пройдіть повторну аутентифікацію для виконання цієї дії.",
	FAILED_TO_UNLINK_LAST_ACCOUNT: "Ви не можете від'єднати останній акаунт",
	ACCOUNT_NOT_FOUND: "Акаунт не знайдено",
	USER_ALREADY_HAS_PASSWORD:
		"Користувач вже має пароль. Вкажіть його, щоб видалити акаунт.",
	VERIFICATION_EMAIL_NOT_ENABLED: "Лист для підтвердження не увімкнено",
	EMAIL_ALREADY_VERIFIED: "Адресу електронної пошти вже підтверджено",
	EMAIL_MISMATCH: "Адреси електронної пошти не збігаються",
	SESSION_NOT_FRESH: "Сеанс не є актуальним",
	LINKED_ACCOUNT_ALREADY_EXISTS: "Прив'язаний акаунт вже існує",
	VALIDATION_ERROR: "Помилка валідації",
	MISSING_FIELD: "Це поле є обов'язковим",
	PASSWORD_ALREADY_SET: "У користувача вже встановлено пароль",
	USER_ID_OR_SESSION_REQUIRED: "Потрібен userId або сесія",
	FAILED_TO_GET_ACCESS_TOKEN: "Не вдалося отримати дійсний токен доступу",
	PROVIDER_NOT_SUPPORTED: "Провайдер не підтримується",
	TOKEN_REFRESH_NOT_SUPPORTED: "Провайдер не підтримує оновлення токенів",
	REFRESH_TOKEN_NOT_FOUND: "Токен оновлення не знайдено",
	FAILED_TO_REFRESH_ACCESS_TOKEN: "Не вдалося оновити токен доступу",
	PROVIDER_NOT_CONFIGURED:
		"Обліковий запис не пов'язано з налаштованим соціальним провайдером.",
	ACCESS_TOKEN_NOT_FOUND: "Токен доступу не знайдено",
	LINKING_NOT_ALLOWED: "Прив'язування облікових записів заборонено",
	LINKING_DIFFERENT_EMAILS_NOT_ALLOWED:
		"Прив'язування облікових записів з різними адресами електронної пошти заборонено",
	LINKING_FAILED: "Не вдалося прив'язати облікові записи",
	EMAIL_PASSWORD_DISABLED: "Вхід за електронною поштою та паролем вимкнено",
	EMAIL_PASSWORD_SIGN_UP_DISABLED:
		"Реєстрацію за електронною поштою та паролем вимкнено",
	RESET_PASSWORD_DISABLED: "Скидання пароля вимкнено",
	UNAUTHORIZED: "Немає доступу",
	NO_FIELDS_TO_UPDATE: "Немає полів для оновлення",
	EMAIL_IS_THE_SAME: "Адреса електронної пошти збігається",
};
