import type { ADMIN_ERROR_CODES } from "better-auth/plugins/admin";
import type { LocalizedTranslations } from "../../../types";

export const nlAdmin: LocalizedTranslations<typeof ADMIN_ERROR_CODES> = {
	FAILED_TO_CREATE_USER: "Mislukt om gebruiker aan te maken",
	USER_ALREADY_EXISTS: "Gebruiker bestaat al.",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"Gebruiker bestaat al. Gebruik een ander e-mailadres.",
	YOU_CANNOT_BAN_YOURSELF: "Je kunt jezelf niet verbannen",
	YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
		"Je bent niet gemachtigd om de rol van gebruikers te wijzigen",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS:
		"Je bent niet gemachtigd om gebruikers aan te maken",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS:
		"Je bent niet gemachtigd om gebruikers te tonen",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
		"Je bent niet gemachtigd om gebruikerssessies te tonen",
	YOU_ARE_NOT_ALLOWED_TO_BAN_USERS:
		"Je bent niet gemachtigd om gebruikers te verbannen",
	YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
		"Je bent niet gemachtigd om de identiteit van gebruikers aan te nemen",
	YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
		"Je bent niet gemachtigd om gebruikerssessies in te trekken",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS:
		"Je bent niet gemachtigd om gebruikers te verwijderen",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
		"Je bent niet gemachtigd om het wachtwoord van gebruikers in te stellen",
	BANNED_USER: "Je bent verbannen uit deze applicatie",
	YOU_ARE_NOT_ALLOWED_TO_GET_USER:
		"Je bent niet gemachtigd om de gebruiker op te halen",
	NO_DATA_TO_UPDATE: "Geen gegevens om bij te werken",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
		"Je bent niet gemachtigd om gebruikers bij te werken",
	YOU_CANNOT_REMOVE_YOURSELF: "Je kunt jezelf niet verwijderen",
	YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
		"Je bent niet gemachtigd om een niet-bestaande rolwaarde in te stellen",
	YOU_CANNOT_IMPERSONATE_ADMINS: "Je kunt geen admins imiteren",
	INVALID_ROLE_TYPE: "Ongeldig roltype",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
		"Je bent niet gemachtigd om het e-mailadres van gebruikers bij te werken",
	PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
		"Wachtwoord kan niet worden bijgewerkt via update-user. Gebruik in plaats daarvan het endpoint set-user-password",
};
