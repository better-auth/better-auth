import type { PASSKEY_ERROR_CODES } from "@better-auth/passkey";
import type { LocalizedTranslations } from "../../../types";

export const plPasskey: LocalizedTranslations<typeof PASSKEY_ERROR_CODES> = {
	CHALLENGE_NOT_FOUND: "Nie znaleziono wyzwania",
	YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
		"Nie masz uprawnień do zarejestrowania tego klucza dostępu",
	FAILED_TO_VERIFY_REGISTRATION: "Weryfikacja rejestracji nie powiodła się",
	PASSKEY_NOT_FOUND: "Nie znaleziono klucza dostępu",
	AUTHENTICATION_FAILED: "Uwierzytelnianie nie powiodło się",
	UNABLE_TO_CREATE_SESSION: "Nie można utworzyć sesji",
	FAILED_TO_UPDATE_PASSKEY: "Aktualizacja klucza dostępu nie powiodła się",
	PREVIOUSLY_REGISTERED: "Zarejestrowano wcześniej",
	REGISTRATION_CANCELLED: "Rejestracja anulowana",
	AUTH_CANCELLED: "Uwierzytelnianie anulowane",
	UNKNOWN_ERROR: "Nieznany błąd",
	SESSION_REQUIRED: "Rejestracja klucza dostępu wymaga uwierzytelnionej sesji",
	RESOLVE_USER_REQUIRED:
		"Rejestracja klucza dostępu wymaga uwierzytelnionej sesji lub funkcji wywołania zwrotnego resolveUser, gdy requireSession jest ustawione na false",
	RESOLVED_USER_INVALID: "Rozwiązany użytkownik jest nieprawidłowy",
};
