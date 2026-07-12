import type { DEVICE_AUTHORIZATION_ERROR_CODES } from "better-auth/plugins/device-authorization";
import type { LocalizedTranslations } from "../../../types";

export const deDeviceAuthorization: LocalizedTranslations<
	typeof DEVICE_AUTHORIZATION_ERROR_CODES
> = {
	INVALID_DEVICE_CODE: "Ungültiger Gerätecode",
	EXPIRED_DEVICE_CODE: "Gerätecode ist abgelaufen",
	EXPIRED_USER_CODE: "Benutzercode ist abgelaufen",
	AUTHORIZATION_PENDING: "Autorisierung ausstehend",
	ACCESS_DENIED: "Zugriff verweigert",
	INVALID_USER_CODE: "Ungültiger Benutzercode",
	DEVICE_CODE_ALREADY_PROCESSED: "Gerätecode bereits verarbeitet",
	DEVICE_CODE_NOT_CLAIMED:
		"Gerätecode wurde nicht von einer Verifizierungssitzung beansprucht; Rufen Sie im angemeldeten Zustand `GET /device` mit dem `user_code` auf, bevor Sie zustimmen oder ablehnen",
	POLLING_TOO_FREQUENTLY: "Abfrage zu häufig",
	USER_NOT_FOUND: "Benutzer nicht gefunden",
	FAILED_TO_CREATE_SESSION: "Sitzung konnte nicht erstellt werden",
	INVALID_DEVICE_CODE_STATUS: "Ungültiger Gerätecodestatus",
	AUTHENTICATION_REQUIRED: "Authentifizierung erforderlich",
};
