import type { ADMIN_ERROR_CODES } from "better-auth/plugins/admin";
import type { LocalizedTranslations } from "../../../types";

export const itAdmin: LocalizedTranslations<typeof ADMIN_ERROR_CODES> = {
	FAILED_TO_CREATE_USER: "Impossibile creare l'utente",
	USER_ALREADY_EXISTS: "L'utente esiste già.",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"L'utente esiste già. Utilizza un'altra e-mail.",
	YOU_CANNOT_BAN_YOURSELF: "Non puoi bandire te stesso",
	YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
		"Non sei autorizzato a modificare il ruolo degli utenti",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "Non sei autorizzato a creare utenti",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS:
		"Non sei autorizzato a elencare gli utenti",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
		"Non sei autorizzato a elencare le sessioni degli utenti",
	YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "Non sei autorizzato a bandire gli utenti",
	YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
		"Non sei autorizzato a impersonare gli utenti",
	YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
		"Non sei autorizzato a revocare le sessioni degli utenti",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS:
		"Non sei autorizzato a eliminare gli utenti",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
		"Non sei autorizzato a impostare la password degli utenti",
	BANNED_USER: "Sei stato bandito da questa applicazione",
	YOU_ARE_NOT_ALLOWED_TO_GET_USER: "Non sei autorizzato a ottenere l'utente",
	NO_DATA_TO_UPDATE: "Nessun dato da aggiornare",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
		"Non sei autorizzato ad aggiornare gli utenti",
	YOU_CANNOT_REMOVE_YOURSELF: "Non puoi rimuovere te stesso",
	YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
		"Non sei autorizzato a impostare un valore di ruolo non esistente",
	YOU_CANNOT_IMPERSONATE_ADMINS: "Non puoi impersonare gli amministratori",
	INVALID_ROLE_TYPE: "Tipo di ruolo non valido",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
		"Non sei autorizzato ad aggiornare l'e-mail degli utenti",
	PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
		"La password non può essere aggiornata tramite l'aggiornamento dell'utente. Utilizza invece l'endpoint set-user-password",
};
