import type { PASSKEY_ERROR_CODES } from "@better-auth/passkey";
import type { LocalizedTranslations } from "../../../types";

export const esPasskey: LocalizedTranslations<typeof PASSKEY_ERROR_CODES> = {
	CHALLENGE_NOT_FOUND: "Desafío no encontrado",
	YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
		"No tienes permiso para registrar esta llave de paso",
	FAILED_TO_VERIFY_REGISTRATION: "Error al verificar el registro",
	PASSKEY_NOT_FOUND: "Llave de paso no encontrada",
	AUTHENTICATION_FAILED: "Autenticación fallida",
	UNABLE_TO_CREATE_SESSION: "No se pudo crear la sesión",
	FAILED_TO_UPDATE_PASSKEY: "Error al actualizar la llave de paso",
	PREVIOUSLY_REGISTERED: "Registrado anteriormente",
	REGISTRATION_CANCELLED: "Registro cancelado",
	AUTH_CANCELLED: "Autenticación cancelada",
	UNKNOWN_ERROR: "Error desconocido",
	SESSION_REQUIRED:
		"El registro de la llave de paso requiere una sesión autenticada",
	RESOLVE_USER_REQUIRED:
		"El registro de la llave de paso requiere una sesión autenticada o una función callback resolveUser cuando requireSession es false",
	RESOLVED_USER_INVALID: "El usuario resuelto no es válido",
};
