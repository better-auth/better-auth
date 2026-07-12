import type { DEVICE_AUTHORIZATION_ERROR_CODES } from "better-auth/plugins/device-authorization";
import type { LocalizedTranslations } from "../../../types";

export const ruDeviceAuthorization: LocalizedTranslations<
	typeof DEVICE_AUTHORIZATION_ERROR_CODES
> = {
	INVALID_DEVICE_CODE: "Неверный код устройства",
	EXPIRED_DEVICE_CODE: "Срок действия кода устройства истек",
	EXPIRED_USER_CODE: "Срок действия кода пользователя истек",
	AUTHORIZATION_PENDING: "Ожидание авторизации",
	ACCESS_DENIED: "В доступе отказано",
	INVALID_USER_CODE: "Неверный код пользователя",
	DEVICE_CODE_ALREADY_PROCESSED: "Код устройства уже обработан",
	DEVICE_CODE_NOT_CLAIMED:
		"Код устройства не был востребован сессией верификации; вызовите `GET /device` с `user_code` во время входа перед подтверждением или отклонением",
	POLLING_TOO_FREQUENTLY: "Слишком частые запросы (опрос)",
	USER_NOT_FOUND: "Пользователь не найден",
	FAILED_TO_CREATE_SESSION: "Не удалось создать сессию",
	INVALID_DEVICE_CODE_STATUS: "Неверный статус кода устройства",
	AUTHENTICATION_REQUIRED: "Требуется аутентификация",
};
