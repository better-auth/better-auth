import type { DEVICE_AUTHORIZATION_ERROR_CODES } from "better-auth/plugins/device-authorization";
import type { LocalizedTranslations } from "../../../types";

export const ukDeviceAuthorization: LocalizedTranslations<
	typeof DEVICE_AUTHORIZATION_ERROR_CODES
> = {
	INVALID_DEVICE_CODE: "Недійсний код пристрою",
	EXPIRED_DEVICE_CODE: "Термін дії коду пристрою закінчився",
	EXPIRED_USER_CODE: "Термін дії коду користувача закінчився",
	AUTHORIZATION_PENDING: "Очікування авторизації",
	ACCESS_DENIED: "У доступі відмовлено",
	INVALID_USER_CODE: "Недійсний код користувача",
	DEVICE_CODE_ALREADY_PROCESSED: "Код пристрою вже оброблено",
	DEVICE_CODE_NOT_CLAIMED:
		"Код пристрою не був затребуваний сесією перевірки; викличте `GET /device` з `user_code` під час входу перед підтвердженням або відхиленням",
	POLLING_TOO_FREQUENTLY: "Занадто часті запити (опитування)",
	USER_NOT_FOUND: "Користувача не знайдено",
	FAILED_TO_CREATE_SESSION: "Не вдалося створити сесію",
	INVALID_DEVICE_CODE_STATUS: "Недійсний статус коду пристрою",
	AUTHENTICATION_REQUIRED: "Потрібна автентифікація",
};
