import type { API_KEY_ERROR_CODES } from "@better-auth/api-key";
import type { LocalizedTranslations } from "../../../types";

export const ukApiKey: LocalizedTranslations<typeof API_KEY_ERROR_CODES> = {
	INVALID_METADATA_TYPE: "метадані мають бути об'єктом або бути невизначеними",
	REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
		"Поле refillAmount є обов'язковим, якщо вказано refillInterval",
	REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
		"Поле refillInterval є обов'язковим, якщо вказано refillAmount",
	USER_BANNED: "Користувач заблокований",
	UNAUTHORIZED_SESSION: "Неавторизована або недійсна сесія",
	KEY_NOT_FOUND: "API-ключ не знайдено",
	KEY_DISABLED: "API-ключ вимкнено",
	KEY_EXPIRED: "Термін дії API-ключа закінчився",
	USAGE_EXCEEDED: "API-ключ вичерпав ліміт використання",
	KEY_NOT_RECOVERABLE: "API-ключ не підлягає відновленню",
	EXPIRES_IN_IS_TOO_SMALL:
		"Значення expiresIn менше за встановлене мінімальне значення.",
	EXPIRES_IN_IS_TOO_LARGE:
		"Значення expiresIn більше за встановлене максимальне значення.",
	INVALID_REMAINING: "Залишок спроб або занадто великий, або занадто малий.",
	INVALID_PREFIX_LENGTH:
		"Довжина префікса або занадто велика, або занадто мала.",
	INVALID_NAME_LENGTH: "Довжина імені або занадто велика, або занадто мала.",
	METADATA_DISABLED: "Метадані вимкнено.",
	RATE_LIMIT_EXCEEDED: "Перевищено ліміт запитів.",
	NO_VALUES_TO_UPDATE: "Немає значень для оновлення.",
	KEY_DISABLED_EXPIRATION: "Користувацький термін дії ключа вимкнено.",
	INVALID_API_KEY: "Недійсний API-ключ.",
	INVALID_USER_ID_FROM_API_KEY:
		"Ідентифікатор користувача з API-ключа недійсний.",
	INVALID_REFERENCE_ID_FROM_API_KEY:
		"Ідентифікатор посилання з API-ключа недійсний.",
	INVALID_API_KEY_GETTER_RETURN_TYPE:
		"Геттер API-ключа повернув недійсний тип ключа. Очікувався рядок.",
	SERVER_ONLY_PROPERTY:
		"Властивість, яку ви намагаєтеся встановити, може бути налаштована лише з екземпляра автентифікації сервера.",
	FAILED_TO_UPDATE_API_KEY: "Не вдалося оновити API-ключ",
	NAME_REQUIRED: "Потрібне ім'я API-ключа.",
	ORGANIZATION_ID_REQUIRED:
		"Ідентифікатор організації потрібен для API-ключів, що належать організації.",
	USER_NOT_MEMBER_OF_ORGANIZATION:
		"Ви не є членом організації, яка володіє цим API-ключем.",
	INSUFFICIENT_API_KEY_PERMISSIONS:
		"У вас немає дозволу на виконання цієї дії з API-ключами організації.",
	NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
		"Конфігурацію за замовчуванням для API-ключів не знайдено.",
	ORGANIZATION_PLUGIN_REQUIRED:
		"Плагін організації потрібен для API-ключів, що належать організації. Будь ласка, встановіть та налаштуйте плагін організації.",
};
