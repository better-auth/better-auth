import type { USERNAME_ERROR_CODES } from "better-auth/plugins/username";
import type { LocalizedTranslations } from "../../../types";

export const nlUsername: LocalizedTranslations<typeof USERNAME_ERROR_CODES> = {
	INVALID_USERNAME_OR_PASSWORD: "Ongeldige gebruikersnaam of wachtwoord",
	EMAIL_NOT_VERIFIED: "E-mailadres niet geverifieerd",
	UNEXPECTED_ERROR: "Onverwachte fout",
	USERNAME_IS_ALREADY_TAKEN: "Gebruikersnaam is al bezet. Probeer een andere.",
	USERNAME_TOO_SHORT: "Gebruikersnaam is te kort",
	USERNAME_TOO_LONG: "Gebruikersnaam is te lang",
	INVALID_USERNAME: "Gebruikersnaam is ongeldig",
	INVALID_DISPLAY_USERNAME: "Weergavenaam is ongeldig",
	USERNAME_IS_IMMUTABLE: "Gebruikersnaam kan niet worden bijgewerkt",
};
