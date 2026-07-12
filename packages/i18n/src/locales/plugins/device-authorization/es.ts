import type { DEVICE_AUTHORIZATION_ERROR_CODES } from "better-auth/plugins/device-authorization";
import type { LocalizedTranslations } from "../../../types";

export const esDeviceAuthorization: LocalizedTranslations<
	typeof DEVICE_AUTHORIZATION_ERROR_CODES
> = {
	INVALID_DEVICE_CODE: "Código de dispositivo inválido",
	EXPIRED_DEVICE_CODE: "El código de dispositivo ha expirado",
	EXPIRED_USER_CODE: "El código de usuario ha expirado",
	AUTHORIZATION_PENDING: "Autorización pendiente",
	ACCESS_DENIED: "Acceso denegado",
	INVALID_USER_CODE: "Código de usuario inválido",
	DEVICE_CODE_ALREADY_PROCESSED:
		"El código de dispositivo ya ha sido procesado",
	DEVICE_CODE_NOT_CLAIMED:
		"El código de dispositivo no ha sido reclamado por una sesión de verificación; llame a `GET /device` con el `user_code` mientras está conectado antes de aprobar o denegar",
	POLLING_TOO_FREQUENTLY: "Sondeo demasiado frecuente",
	USER_NOT_FOUND: "Usuario no encontrado",
	FAILED_TO_CREATE_SESSION: "Error al crear la sesión",
	INVALID_DEVICE_CODE_STATUS: "Estado del código de dispositivo inválido",
	AUTHENTICATION_REQUIRED: "Autenticación requerida",
};
