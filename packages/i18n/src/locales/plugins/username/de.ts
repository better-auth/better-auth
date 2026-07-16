import type { USERNAME_ERROR_CODES } from "better-auth/plugins/username";
import type { LocalizedTranslations } from "../../../types";

export const deUsername: LocalizedTranslations<typeof USERNAME_ERROR_CODES> = {
	INVALID_USERNAME_OR_PASSWORD: "Ungültiger Benutzername oder Passwort",
	EMAIL_NOT_VERIFIED: "E-Mail nicht verifiziert",
	UNEXPECTED_ERROR: "Unerwarteter Fehler",
	USERNAME_IS_ALREADY_TAKEN:
		"Benutzername ist bereits vergeben. Bitte wählen Sie einen anderen.",
	USERNAME_TOO_SHORT: "Benutzername ist zu kurz",
	USERNAME_TOO_LONG: "Benutzername ist zu lang",
	INVALID_USERNAME: "Benutzername ist ungültig",
	INVALID_DISPLAY_USERNAME: "Anzeigename ist ungültig",
	USERNAME_IS_IMMUTABLE: "Benutzername kann nicht geändert werden",
};
