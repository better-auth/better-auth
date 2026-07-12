import type { USERNAME_ERROR_CODES } from "better-auth/plugins/username";
import type { LocalizedTranslations } from "../../../types";

export const itUsername: LocalizedTranslations<typeof USERNAME_ERROR_CODES> = {
	INVALID_USERNAME_OR_PASSWORD: "Nome utente o password non validi",
	EMAIL_NOT_VERIFIED: "E-mail non verificata",
	UNEXPECTED_ERROR: "Errore imprevisto",
	USERNAME_IS_ALREADY_TAKEN: "Nome utente già in uso. Prova un altro nome.",
	USERNAME_TOO_SHORT: "Il nome utente è troppo corto",
	USERNAME_TOO_LONG: "Il nome utente è troppo lungo",
	INVALID_USERNAME: "Nome utente non valido",
	INVALID_DISPLAY_USERNAME: "Nome visualizzato non valido",
	USERNAME_IS_IMMUTABLE: "Il nome utente non può essere modificato",
};
