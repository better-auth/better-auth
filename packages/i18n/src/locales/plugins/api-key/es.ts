import type { API_KEY_ERROR_CODES } from "@better-auth/api-key";
import type { LocalizedTranslations } from "../../../types";

export const esApiKey: LocalizedTranslations<typeof API_KEY_ERROR_CODES> = {
	INVALID_METADATA_TYPE: "metadata debe ser un objeto o indefinido",
	REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
		"refillAmount es obligatorio cuando se proporciona refillInterval",
	REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
		"refillInterval es obligatorio cuando se proporciona refillAmount",
	USER_BANNED: "El usuario está suspendido",
	UNAUTHORIZED_SESSION: "Sesión no autorizada o no válida",
	KEY_NOT_FOUND: "Llave API no encontrada",
	KEY_DISABLED: "La llave API está deshabilitada",
	KEY_EXPIRED: "La llave API ha expirado",
	USAGE_EXCEEDED: "La llave API ha alcanzado su límite de uso",
	KEY_NOT_RECOVERABLE: "La llave API no es recuperable",
	EXPIRES_IN_IS_TOO_SMALL:
		"El valor de expiresIn es menor que el valor mínimo predefinido.",
	EXPIRES_IN_IS_TOO_LARGE:
		"El valor de expiresIn es mayor que el valor máximo predefinido.",
	INVALID_REMAINING:
		"El conteo restante es demasiado grande o demasiado pequeño.",
	INVALID_PREFIX_LENGTH:
		"La longitud del prefijo es demasiado grande o demasiado pequeña.",
	INVALID_NAME_LENGTH:
		"La longitud del nombre es demasiado grande o demasiado pequeña.",
	METADATA_DISABLED: "Los metadatos están deshabilitados.",
	RATE_LIMIT_EXCEEDED: "Límite de velocidad excedido.",
	NO_VALUES_TO_UPDATE: "No hay valores para actualizar.",
	KEY_DISABLED_EXPIRATION:
		"Los valores de expiración de llave personalizados están deshabilitados.",
	INVALID_API_KEY: "Llave API no válida.",
	INVALID_USER_ID_FROM_API_KEY:
		"El ID de usuario de la llave API no es válido.",
	INVALID_REFERENCE_ID_FROM_API_KEY:
		"El ID de referencia de la llave API no es válido.",
	INVALID_API_KEY_GETTER_RETURN_TYPE:
		"El método getter de la llave API devolvió un tipo de llave no válido. Se esperaba una cadena.",
	SERVER_ONLY_PROPERTY:
		"La propiedad que estás intentando configurar solo se puede establecer desde la instancia de autenticación del servidor.",
	FAILED_TO_UPDATE_API_KEY: "Error al actualizar la llave API",
	NAME_REQUIRED: "El nombre de la llave API es obligatorio.",
	ORGANIZATION_ID_REQUIRED:
		"El ID de la organización es obligatorio para las llaves API propiedad de una organización.",
	USER_NOT_MEMBER_OF_ORGANIZATION:
		"No eres miembro de la organización propietaria de esta llave API.",
	INSUFFICIENT_API_KEY_PERMISSIONS:
		"No tienes permiso para realizar esta acción en las llaves API de la organización.",
	NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
		"No se encontró ninguna configuración de llave API predeterminada.",
	ORGANIZATION_PLUGIN_REQUIRED:
		"Se requiere el complemento de organización para las llaves API propiedad de la organización. Instala y configura el complemento de organización.",
};
