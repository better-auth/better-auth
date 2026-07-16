import type { ANONYMOUS_ERROR_CODES } from "better-auth/plugins/anonymous";
import type { LocalizedTranslations } from "../../../types";

export const esAnonymous: LocalizedTranslations<typeof ANONYMOUS_ERROR_CODES> =
	{
		INVALID_EMAIL_FORMAT:
			"El correo electrónico no fue generado en un formato válido",
		FAILED_TO_CREATE_USER: "Error al crear el usuario",
		COULD_NOT_CREATE_SESSION: "No se pudo crear la sesión",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Los usuarios anónimos no pueden volver a iniciar sesión de forma anónima",
		FAILED_TO_DELETE_ANONYMOUS_USER: "Error al eliminar el usuario anónimo",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Error al eliminar las sesiones del usuario anónimo",
		USER_IS_NOT_ANONYMOUS: "El usuario no es anónimo",
		DELETE_ANONYMOUS_USER_DISABLED:
			"La eliminación de usuarios anónimos está desactivada",
	};
