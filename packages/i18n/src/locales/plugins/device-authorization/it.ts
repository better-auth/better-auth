import type { DEVICE_AUTHORIZATION_ERROR_CODES } from "better-auth/plugins/device-authorization";
import type { LocalizedTranslations } from "../../../types";

export const itDeviceAuthorization: LocalizedTranslations<
	typeof DEVICE_AUTHORIZATION_ERROR_CODES
> = {
	INVALID_DEVICE_CODE: "Codice dispositivo non valido",
	EXPIRED_DEVICE_CODE: "Il codice dispositivo è scaduto",
	EXPIRED_USER_CODE: "Il codice utente è scaduto",
	AUTHORIZATION_PENDING: "Autorizzazione in corso",
	ACCESS_DENIED: "Accesso negato",
	INVALID_USER_CODE: "Codice utente non valido",
	DEVICE_CODE_ALREADY_PROCESSED: "Codice dispositivo già elaborato",
	DEVICE_CODE_NOT_CLAIMED:
		"Il codice dispositivo non è stato richiesto da una sessione di verifica; chiama `GET /device` con `user_code` mentre sei connesso prima di approvare o rifiutare",
	POLLING_TOO_FREQUENTLY: "Interrogazione troppo frequente",
	USER_NOT_FOUND: "Utente non trovato",
	FAILED_TO_CREATE_SESSION: "Impossibile creare la sessione",
	INVALID_DEVICE_CODE_STATUS: "Stato del codice dispositivo non valido",
	AUTHENTICATION_REQUIRED: "Autenticazione richiesta",
};
