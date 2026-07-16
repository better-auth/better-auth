import type { USERNAME_ERROR_CODES } from "better-auth/plugins/username";
import type { LocalizedTranslations } from "../../../types";

export const svUsername: LocalizedTranslations<typeof USERNAME_ERROR_CODES> = {
	INVALID_USERNAME_OR_PASSWORD: "Ogiltigt användarnamn eller lösenord",
	EMAIL_NOT_VERIFIED: "E-postadressen är inte verifierad",
	UNEXPECTED_ERROR: "Oväntat fel",
	USERNAME_IS_ALREADY_TAKEN:
		"Användarnamnet är redan upptaget. Vänligen välj ett annat.",
	USERNAME_TOO_SHORT: "Användarnamnet är för kort",
	USERNAME_TOO_LONG: "Användarnamnet är för långt",
	INVALID_USERNAME: "Ogiltigt användarnamn",
	INVALID_DISPLAY_USERNAME: "Ogiltigt visningsnamn",
	USERNAME_IS_IMMUTABLE: "Användarnamnet kan inte uppdateras",
};
