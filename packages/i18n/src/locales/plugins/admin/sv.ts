import type { ADMIN_ERROR_CODES } from "better-auth/plugins/admin";
import type { LocalizedTranslations } from "../../../types";

export const svAdmin: LocalizedTranslations<typeof ADMIN_ERROR_CODES> = {
	FAILED_TO_CREATE_USER: "Det gick inte att skapa användare",
	USER_ALREADY_EXISTS: "Användaren finns redan.",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"Användaren finns redan. Använd en annan e-postadress.",
	YOU_CANNOT_BAN_YOURSELF: "Du kan inte stänga av dig själv",
	YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
		"Du har inte tillåtelse att ändra användares roll",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS:
		"Du har inte tillåtelse att skapa användare",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS:
		"Du har inte tillåtelse att lista användare",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
		"Du har inte tillåtelse att lista användares sessioner",
	YOU_ARE_NOT_ALLOWED_TO_BAN_USERS:
		"Du har inte tillåtelse att stänga av användare",
	YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
		"Du har inte tillåtelse att imitera användare",
	YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
		"Du har inte tillåtelse att återkalla användares sessioner",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS:
		"Du har inte tillåtelse att ta bort användare",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
		"Du har inte tillåtelse att ange användares lösenord",
	BANNED_USER: "Du har stängts av från denna applikation",
	YOU_ARE_NOT_ALLOWED_TO_GET_USER: "Du har inte tillåtelse att hämta användare",
	NO_DATA_TO_UPDATE: "Det finns ingen data att uppdatera",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
		"Du har inte tillåtelse att uppdatera användare",
	YOU_CANNOT_REMOVE_YOURSELF: "Du kan inte ta bort dig själv",
	YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
		"Du har inte tillåtelse att ange ett rollvärde som inte existerar",
	YOU_CANNOT_IMPERSONATE_ADMINS: "Du kan inte imitera administratörer",
	INVALID_ROLE_TYPE: "Ogiltig rolltyp",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
		"Du har inte tillåtelse att uppdatera användares e-postadress",
	PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
		"Lösenordet kan inte uppdateras via uppdatera användare. Använd endpointen set-user-password istället",
};
