import type { TranslationDictionary } from "../types";

/**
 * Spanish translations
 */
export const es: TranslationDictionary = {
	USER_NOT_FOUND: "Usuario no encontrado",
	FAILED_TO_CREATE_USER: "Error al crear el usuario",
	FAILED_TO_CREATE_SESSION: "Error al crear la sesión",
	FAILED_TO_UPDATE_USER: "Error al actualizar el usuario",
	FAILED_TO_GET_SESSION: "Error al obtener la sesión",
	INVALID_PASSWORD: "Contraseña inválida",
	INVALID_EMAIL: "Correo electrónico inválido",
	INVALID_EMAIL_OR_PASSWORD: "Correo electrónico o contraseña inválidos",
	INVALID_USER: "Usuario inválido",
	SOCIAL_ACCOUNT_ALREADY_LINKED: "La cuenta social ya está vinculada",
	PROVIDER_NOT_FOUND: "Proveedor no encontrado",
	INVALID_TOKEN: "Token inválido",
	TOKEN_EXPIRED: "Token expirado",
	FAILED_TO_GET_USER_INFO:
		"Error al obtener la información del usuario",
	USER_EMAIL_NOT_FOUND: "Correo electrónico del usuario no encontrado",
	EMAIL_NOT_VERIFIED: "Correo electrónico no verificado",
	PASSWORD_TOO_SHORT: "Contraseña demasiado corta",
	PASSWORD_TOO_LONG: "Contraseña demasiado larga",
	USER_ALREADY_EXISTS: "El usuario ya existe",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"El usuario ya existe. Usa otro correo electrónico.",
	EMAIL_CAN_NOT_BE_UPDATED: "El correo electrónico no puede actualizarse",
	CREDENTIAL_ACCOUNT_NOT_FOUND: "Cuenta de credenciales no encontrada",
	SESSION_EXPIRED:
		"Sesión expirada. Vuelve a autenticarte para realizar esta acción.",
	FAILED_TO_UNLINK_LAST_ACCOUNT: "No puedes desvincular tu última cuenta",
	ACCOUNT_NOT_FOUND: "Cuenta no encontrada",
	USER_ALREADY_HAS_PASSWORD:
		"El usuario ya tiene una contraseña. Proporciónala para eliminar la cuenta.",
	VERIFICATION_EMAIL_NOT_ENABLED:
		"El correo de verificación no está habilitado",
	EMAIL_ALREADY_VERIFIED: "El correo electrónico ya está verificado",
	EMAIL_MISMATCH: "Los correos electrónicos no coinciden",
	SESSION_NOT_FRESH: "La sesión no es reciente",
	LINKED_ACCOUNT_ALREADY_EXISTS: "La cuenta vinculada ya existe",
	VALIDATION_ERROR: "Error de validación",
	MISSING_FIELD: "Este campo es requerido",
	PASSWORD_ALREADY_SET: "El usuario ya tiene una contraseña establecida",
};
