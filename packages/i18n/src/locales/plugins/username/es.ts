import type { USERNAME_ERROR_CODES } from "better-auth/plugins/username";
import type { LocalizedTranslations } from "../../../types";

export const esUsername: LocalizedTranslations<typeof USERNAME_ERROR_CODES> = {
	INVALID_USERNAME_OR_PASSWORD: "Nombre de usuario o contraseña inválidos",
	EMAIL_NOT_VERIFIED: "Correo electrónico no verificado",
	UNEXPECTED_ERROR: "Error inesperado",
	USERNAME_IS_ALREADY_TAKEN:
		"El nombre de usuario ya está en uso. Por favor, intenta con otro.",
	USERNAME_TOO_SHORT: "El nombre de usuario es demasiado corto",
	USERNAME_TOO_LONG: "El nombre de usuario es demasiado largo",
	INVALID_USERNAME: "El nombre de usuario es inválido",
	INVALID_DISPLAY_USERNAME: "El nombre de pantalla es inválido",
	USERNAME_IS_IMMUTABLE: "El nombre de usuario no puede ser actualizado",
};
