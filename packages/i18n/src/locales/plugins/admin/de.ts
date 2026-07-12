import type { ADMIN_ERROR_CODES } from "better-auth/plugins/admin";
import type { LocalizedTranslations } from "../../../types";

export const deAdmin: LocalizedTranslations<typeof ADMIN_ERROR_CODES> = {
	FAILED_TO_CREATE_USER: "Benutzer konnte nicht erstellt werden",
	USER_ALREADY_EXISTS: "Benutzer existiert bereits.",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"Benutzer existiert bereits. Bitte verwenden Sie eine andere E-Mail-Adresse.",
	YOU_CANNOT_BAN_YOURSELF: "Sie können sich nicht selbst sperren",
	YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
		"Sie sind nicht berechtigt, die Rolle des Benutzers zu ändern",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS:
		"Sie sind nicht berechtigt, Benutzer zu erstellen",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS:
		"Sie sind nicht berechtigt, Benutzer aufzulisten",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
		"Sie sind nicht berechtigt, Benutzersitzungen aufzulisten",
	YOU_ARE_NOT_ALLOWED_TO_BAN_USERS:
		"Sie sind nicht berechtigt, Benutzer zu sperren",
	YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
		"Sie sind nicht berechtigt, die Identität von Benutzern anzunehmen",
	YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
		"Sie sind nicht berechtigt, Benutzersitzungen zu widerrufen",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS:
		"Sie sind nicht berechtigt, Benutzer zu löschen",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
		"Sie sind nicht berechtigt, das Passwort von Benutzern festzulegen",
	BANNED_USER: "Sie wurden aus dieser Anwendung gesperrt",
	YOU_ARE_NOT_ALLOWED_TO_GET_USER:
		"Sie sind nicht berechtigt, den Benutzer abzurufen",
	NO_DATA_TO_UPDATE: "Keine Daten zum Aktualisieren vorhanden",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
		"Sie sind nicht berechtigt, Benutzer zu aktualisieren",
	YOU_CANNOT_REMOVE_YOURSELF: "Sie können sich nicht selbst entfernen",
	YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
		"Sie sind nicht berechtigt, einen nicht existierenden Rollenwert festzulegen",
	YOU_CANNOT_IMPERSONATE_ADMINS: "Sie können keine Administratoren imitieren",
	INVALID_ROLE_TYPE: "Ungültiger Rollentyp",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
		"Sie sind nicht berechtigt, die E-Mail-Adresse von Benutzern zu aktualisieren",
	PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
		"Das Passwort kann nicht über Benutzer aktualisieren geändert werden. Verwenden Sie stattdessen den Endpunkt set-user-password",
};
