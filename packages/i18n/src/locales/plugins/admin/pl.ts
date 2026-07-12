import type { ADMIN_ERROR_CODES } from "better-auth/plugins/admin";
import type { LocalizedTranslations } from "../../../types";

export const plAdmin: LocalizedTranslations<typeof ADMIN_ERROR_CODES> = {
	FAILED_TO_CREATE_USER: "Nie udało się utworzyć użytkownika",
	USER_ALREADY_EXISTS: "Użytkownik już istnieje.",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"Użytkownik już istnieje. Użyj innego adresu e-mail.",
	YOU_CANNOT_BAN_YOURSELF: "Nie możesz zablokować samego siebie",
	YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
		"Nie masz uprawnień do zmiany roli użytkowników",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS:
		"Nie masz uprawnień do tworzenia użytkowników",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS:
		"Nie masz uprawnień do wyświetlania listy użytkowników",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
		"Nie masz uprawnień do wyświetlania sesji użytkowników",
	YOU_ARE_NOT_ALLOWED_TO_BAN_USERS:
		"Nie masz uprawnień do blokowania użytkowników",
	YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
		"Nie masz uprawnień do podszywania się pod użytkowników",
	YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
		"Nie masz uprawnień do unieważniania sesji użytkowników",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS:
		"Nie masz uprawnień do usuwania użytkowników",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
		"Nie masz uprawnień do ustawiania hasła użytkowników",
	BANNED_USER: "Zostałeś zablokowany w tej aplikacji",
	YOU_ARE_NOT_ALLOWED_TO_GET_USER:
		"Nie masz uprawnień do pobierania użytkownika",
	NO_DATA_TO_UPDATE: "Brak danych do aktualizacji",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
		"Nie masz uprawnień do aktualizowania użytkowników",
	YOU_CANNOT_REMOVE_YOURSELF: "Nie możesz usunąć samego siebie",
	YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
		"Nie masz uprawnień do ustawiania nieistniejącej roli",
	YOU_CANNOT_IMPERSONATE_ADMINS: "Nie możesz podszywać się pod administratorów",
	INVALID_ROLE_TYPE: "Nieprawidłowy typ roli",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
		"Nie masz uprawnień do aktualizowania adresu e-mail użytkowników",
	PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
		"Hasło nie może być aktualizowane przez aktualizację użytkownika. Użyj zamiast tego punktu końcowego set-user-password",
};
