import type { USERNAME_ERROR_CODES } from "better-auth/plugins/username";
import type { LocalizedTranslations } from "../../../types";

export const frUsername: LocalizedTranslations<typeof USERNAME_ERROR_CODES> = {
	INVALID_USERNAME_OR_PASSWORD: "Nom d'utilisateur ou mot de passe invalide",
	EMAIL_NOT_VERIFIED: "E-mail non vérifié",
	UNEXPECTED_ERROR: "Erreur inattendue",
	USERNAME_IS_ALREADY_TAKEN:
		"Ce nom d'utilisateur est déjà pris. Veuillez en choisir un autre.",
	USERNAME_TOO_SHORT: "Nom d'utilisateur trop court",
	USERNAME_TOO_LONG: "Nom d'utilisateur trop long",
	INVALID_USERNAME: "Nom d'utilisateur invalide",
	INVALID_DISPLAY_USERNAME: "Nom d'affichage invalide",
	USERNAME_IS_IMMUTABLE: "Le nom d'utilisateur ne peut pas être modifié",
};
