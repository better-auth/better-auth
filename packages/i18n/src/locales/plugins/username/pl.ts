import type { USERNAME_ERROR_CODES } from "better-auth/plugins/username";
import type { LocalizedTranslations } from "../../../types";

export const plUsername: LocalizedTranslations<typeof USERNAME_ERROR_CODES> = {
	INVALID_USERNAME_OR_PASSWORD: "Nieprawidłowa nazwa użytkownika lub hasło",
	EMAIL_NOT_VERIFIED: "E-mail niezweryfikowany",
	UNEXPECTED_ERROR: "Nieoczekiwany błąd",
	USERNAME_IS_ALREADY_TAKEN:
		"Ta nazwa użytkownika jest już zajęta. Spróbuj innej.",
	USERNAME_TOO_SHORT: "Nazwa użytkownika jest za krótka",
	USERNAME_TOO_LONG: "Nazwa użytkownika jest za długa",
	INVALID_USERNAME: "Nieprawidłowa nazwa użytkownika",
	INVALID_DISPLAY_USERNAME: "Nieprawidłowa nazwa wyświetlana",
	USERNAME_IS_IMMUTABLE: "Nie można zaktualizować nazwy użytkownika",
};
