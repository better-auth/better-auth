import type { BASE_ERROR_CODES } from "@better-auth/core/error";
import type { LocalizedTranslations } from "../../types";

export const ukCore: LocalizedTranslations<typeof BASE_ERROR_CODES> = {
	ACCOUNT_NOT_FOUND: "Обліковий запис не знайдено",
	ASYNC_VALIDATION_NOT_SUPPORTED: "Async validation is not supported",
	BODY_MUST_BE_AN_OBJECT: "Body must be an object",
	CALLBACK_URL_REQUIRED: "callbackURL is required",
	CHANGE_EMAIL_DISABLED: "Change email is disabled",
	CREDENTIAL_ACCOUNT_NOT_FOUND:
		"Обліковий запис із даними авторизації не знайдено",
	CROSS_SITE_NAVIGATION_LOGIN_BLOCKED:
		"Cross-site navigation login blocked. This request appears to be a CSRF attack.",
	EMAIL_ALREADY_VERIFIED: "Електронна пошта вже підтверджена",
	EMAIL_CAN_NOT_BE_UPDATED: "Електронну пошту не можна оновити",
	EMAIL_MISMATCH: "Електронні пошти не збігаються",
	EMAIL_NOT_VERIFIED: "Електронна пошта не підтверджена",
	FAILED_TO_CREATE_SESSION: "Не вдалося створити сесію",
	FAILED_TO_CREATE_USER: "Не вдалося створити користувача",
	FAILED_TO_CREATE_VERIFICATION: "Unable to create verification",
	FAILED_TO_GET_SESSION: "Не вдалося отримати сесію",
	FAILED_TO_GET_USER_INFO: "Не вдалося отримати інформацію про користувача",
	FAILED_TO_UNLINK_LAST_ACCOUNT:
		"Ви не можете відв’язати свій останній обліковий запис",
	FAILED_TO_UPDATE_USER: "Не вдалося оновити користувача",
	FIELD_NOT_ALLOWED: "Field not allowed to be set",
	ID_TOKEN_NOT_SUPPORTED: "id_token not supported",
	INVALID_CALLBACK_URL: "Invalid callbackURL",
	INVALID_EMAIL: "Недійсна адреса електронної пошти",
	INVALID_EMAIL_OR_PASSWORD: "Неправильна адреса електронної пошти або пароль",
	INVALID_ERROR_CALLBACK_URL: "Invalid errorCallbackURL",
	INVALID_NEW_USER_CALLBACK_URL: "Invalid newUserCallbackURL",
	INVALID_ORIGIN: "Invalid origin",
	INVALID_PASSWORD: "Неправильний пароль",
	INVALID_REDIRECT_URL: "Invalid redirectURL",
	INVALID_TOKEN: "Недійсний токен",
	INVALID_USER: "Недійсний користувач",
	LINKED_ACCOUNT_ALREADY_EXISTS: "Пов’язаний обліковий запис вже існує",
	METHOD_NOT_ALLOWED_DEFER_SESSION_REQUIRED:
		"POST method requires deferSessionRefresh to be enabled in session config",
	MISSING_FIELD: "Це поле обов’язкове",
	MISSING_OR_NULL_ORIGIN: "Missing or null Origin",
	PASSWORD_ALREADY_SET: "У користувача вже встановлено пароль",
	PASSWORD_TOO_LONG: "Пароль занадто довгий",
	PASSWORD_TOO_SHORT: "Пароль занадто короткий",
	PROVIDER_NOT_FOUND: "Провайдера не знайдено",
	SESSION_EXPIRED:
		"Термін дії сесії закінчився. Будь ласка, авторизуйтеся знову.",
	SESSION_NOT_FRESH: "Сесія застаріла",
	SOCIAL_ACCOUNT_ALREADY_LINKED: "Соціальний акаунт вже прив'язано",
	TOKEN_EXPIRED: "Термін дії токена закінчився",
	USER_ALREADY_EXISTS: "Користувач вже існує",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"Користувач вже існує. Скористайтеся іншою поштою.",
	USER_ALREADY_HAS_PASSWORD:
		"Користувач вже має пароль. Вкажіть його для видалення акаунта.",
	USER_EMAIL_NOT_FOUND: "Електронну пошту користувача не знайдено",
	USER_NOT_FOUND: "Користувача не знайдено",
	VALIDATION_ERROR: "Помилка валідації",
	VERIFICATION_EMAIL_NOT_ENABLED: "Лист для підтвердження не увімкнено",
};
