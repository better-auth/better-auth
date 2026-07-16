import type { ADMIN_ERROR_CODES } from "better-auth/plugins/admin";
import type { LocalizedTranslations } from "../../../types";

export const esAdmin: LocalizedTranslations<typeof ADMIN_ERROR_CODES> = {
	FAILED_TO_CREATE_USER: "Error al crear el usuario",
	USER_ALREADY_EXISTS: "El usuario ya existe.",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"El usuario ya existe. Utiliza otro correo electrónico.",
	YOU_CANNOT_BAN_YOURSELF: "No puedes expulsarte a ti mismo",
	YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
		"No tienes permitido cambiar el rol de los usuarios",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "No tienes permitido crear usuarios",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: "No tienes permitido listar usuarios",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
		"No tienes permitido listar las sesiones de los usuarios",
	YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "No tienes permitido expulsar usuarios",
	YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
		"No tienes permitido suplantar usuarios",
	YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
		"No tienes permitido revocar sesiones de usuarios",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: "No tienes permitido eliminar usuarios",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
		"No tienes permitido establecer la contraseña de los usuarios",
	BANNED_USER: "Has sido expulsado de esta aplicación",
	YOU_ARE_NOT_ALLOWED_TO_GET_USER: "No tienes permitido obtener el usuario",
	NO_DATA_TO_UPDATE: "No hay datos para actualizar",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
		"No tienes permitido actualizar usuarios",
	YOU_CANNOT_REMOVE_YOURSELF: "No puedes eliminarte a ti mismo",
	YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
		"No tienes permitido establecer un valor de rol inexistente",
	YOU_CANNOT_IMPERSONATE_ADMINS: "No puedes suplantar a administradores",
	INVALID_ROLE_TYPE: "Tipo de rol inválido",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
		"No tienes permitido actualizar el correo electrónico de los usuarios",
	PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
		"La contraseña no se puede actualizar a través de actualizar usuario. Utiliza el punto de acceso set-user-password en su lugar",
};
