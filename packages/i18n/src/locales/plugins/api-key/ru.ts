import type { API_KEY_ERROR_CODES } from "@better-auth/api-key";
import type { LocalizedTranslations } from "../../../types";

export const ruApiKey: LocalizedTranslations<typeof API_KEY_ERROR_CODES> = {
	INVALID_METADATA_TYPE:
		"метаданные должны быть объектом или быть неопределенными",
	REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
		"Поле refillAmount обязательно, если указано refillInterval",
	REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
		"Поле refillInterval обязательно, если указано refillAmount",
	USER_BANNED: "Пользователь заблокирован",
	UNAUTHORIZED_SESSION: "Неавторизованная или недействительная сессия",
	KEY_NOT_FOUND: "API-ключ не найден",
	KEY_DISABLED: "API-ключ отключен",
	KEY_EXPIRED: "API-ключ истек",
	USAGE_EXCEEDED: "API-ключ исчерпал лимит использования",
	KEY_NOT_RECOVERABLE: "API-ключ не подлежит восстановлению",
	EXPIRES_IN_IS_TOO_SMALL:
		"Значение expiresIn меньше предопределенного минимального значения.",
	EXPIRES_IN_IS_TOO_LARGE:
		"Значение expiresIn больше предопределенного максимального значения.",
	INVALID_REMAINING:
		"Оставшееся количество либо слишком велико, либо слишком мало.",
	INVALID_PREFIX_LENGTH:
		"Длина префикса либо слишком велика, либо слишком мала.",
	INVALID_NAME_LENGTH: "Длина имени либо слишком велика, либо слишком мала.",
	METADATA_DISABLED: "Метаданные отключены.",
	RATE_LIMIT_EXCEEDED: "Превышен лимит запросов.",
	NO_VALUES_TO_UPDATE: "Нет значений для обновления.",
	KEY_DISABLED_EXPIRATION: "Настраиваемый срок действия ключа отключен.",
	INVALID_API_KEY: "Недействительный API-ключ.",
	INVALID_USER_ID_FROM_API_KEY:
		"Идентификатор пользователя из API-ключа недействителен.",
	INVALID_REFERENCE_ID_FROM_API_KEY:
		"Идентификатор ссылки из API-ключа недействителен.",
	INVALID_API_KEY_GETTER_RETURN_TYPE:
		"Геттер API-ключа вернул неверный тип ключа. Ожидалась строка.",
	SERVER_ONLY_PROPERTY:
		"Свойство, которое вы пытаетесь задать, может быть установлено только из экземпляра аутентификации сервера.",
	FAILED_TO_UPDATE_API_KEY: "Не удалось обновить API-ключ",
	NAME_REQUIRED: "Требуется имя API-ключа.",
	ORGANIZATION_ID_REQUIRED:
		"Идентификатор организации требуется для API-ключей, принадлежащих организации.",
	USER_NOT_MEMBER_OF_ORGANIZATION:
		"Вы не являетесь членом организации, владеющей этим API-ключом.",
	INSUFFICIENT_API_KEY_PERMISSIONS:
		"У вас нет прав на выполнение этого действия с API-ключами организации.",
	NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
		"Конфигурация по умолчанию для API-ключей не найдена.",
	ORGANIZATION_PLUGIN_REQUIRED:
		"Плагин организации требуется для API-ключей, принадлежащих организации. Пожалуйста, установите и настройте плагин организации.",
};
