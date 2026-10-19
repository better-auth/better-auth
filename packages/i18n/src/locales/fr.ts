import type { TranslationDictionary } from "../types";

/**
 * French translations
 */
export const fr: TranslationDictionary = {
	USER_NOT_FOUND: "Utilisateur non trouvé",
	FAILED_TO_CREATE_USER: "Échec de la création de l'utilisateur",
	FAILED_TO_CREATE_SESSION: "Échec de la création de la session",
	FAILED_TO_UPDATE_USER: "Échec de la mise à jour de l'utilisateur",
	FAILED_TO_GET_SESSION: "Échec de la récupération de la session",
	INVALID_PASSWORD: "Mot de passe invalide",
	INVALID_EMAIL: "Adresse e-mail invalide",
	INVALID_EMAIL_OR_PASSWORD: "Email ou mot de passe invalide",
	INVALID_USER: "Utilisateur invalide",
	SOCIAL_ACCOUNT_ALREADY_LINKED: "Compte social déjà lié",
	PROVIDER_NOT_FOUND: "Fournisseur non trouvé",
	INVALID_TOKEN: "Jeton invalide",
	TOKEN_EXPIRED: "Jeton expiré",
	FAILED_TO_GET_USER_INFO:
		"Échec de la récupération des informations utilisateur",
	USER_EMAIL_NOT_FOUND: "Adresse e-mail de l'utilisateur non trouvée",
	EMAIL_NOT_VERIFIED: "Adresse e-mail non vérifiée",
	PASSWORD_TOO_SHORT: "Mot de passe trop court",
	PASSWORD_TOO_LONG: "Mot de passe trop long",
	USER_ALREADY_EXISTS: "L'utilisateur existe déjà",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"L'utilisateur existe déjà. Utilisez une autre adresse e-mail.",
	EMAIL_CAN_NOT_BE_UPDATED: "L'adresse e-mail ne peut pas être mise à jour",
	CREDENTIAL_ACCOUNT_NOT_FOUND: "Compte de connexion non trouvé",
	SESSION_EXPIRED:
		"Session expirée. Veuillez vous reconnecter pour effectuer cette action.",
	FAILED_TO_UNLINK_LAST_ACCOUNT:
		"Vous ne pouvez pas dissocier votre dernier compte",
	ACCOUNT_NOT_FOUND: "Compte non trouvé",
	USER_ALREADY_HAS_PASSWORD:
		"L'utilisateur a déjà un mot de passe. Fournissez-le pour supprimer le compte.",
	VERIFICATION_EMAIL_NOT_ENABLED: "L'e-mail de vérification n'est pas activé",
	EMAIL_ALREADY_VERIFIED: "L'adresse e-mail est déjà vérifiée",
	EMAIL_MISMATCH: "Discordance d'adresses e-mail",
	SESSION_NOT_FRESH: "La session n'est pas récente",
	LINKED_ACCOUNT_ALREADY_EXISTS: "Le compte lié existe déjà",
	VALIDATION_ERROR: "Erreur de validation",
	MISSING_FIELD: "Ce champ est requis",
	PASSWORD_ALREADY_SET: "L'utilisateur a déjà un mot de passe défini",
	USER_ID_OR_SESSION_REQUIRED: "userId ou session requis",
	FAILED_TO_GET_ACCESS_TOKEN: "Échec de l'obtention d'un jeton d'accès valide",
	PROVIDER_NOT_SUPPORTED: "Fournisseur non pris en charge",
	TOKEN_REFRESH_NOT_SUPPORTED:
		"Le fournisseur ne prend pas en charge l'actualisation du jeton",
	REFRESH_TOKEN_NOT_FOUND: "Jeton d'actualisation non trouvé",
	FAILED_TO_REFRESH_ACCESS_TOKEN: "Échec de l'actualisation du jeton d'accès",
	PROVIDER_NOT_CONFIGURED:
		"Le compte n'est associé à aucun fournisseur social configuré.",
	ACCESS_TOKEN_NOT_FOUND: "Jeton d'accès non trouvé",
	LINKING_NOT_ALLOWED: "La liaison de compte n'est pas autorisée",
	LINKING_DIFFERENT_EMAILS_NOT_ALLOWED:
		"La liaison de comptes avec des e-mails différents n'est pas autorisée",
	LINKING_FAILED: "Échec de la liaison du compte",
	EMAIL_PASSWORD_DISABLED: "L'e-mail et le mot de passe ne sont pas activés",
	EMAIL_PASSWORD_SIGN_UP_DISABLED:
		"L'inscription par e-mail et mot de passe n'est pas activée",
	RESET_PASSWORD_DISABLED:
		"La réinitialisation du mot de passe n'est pas activée",
	UNAUTHORIZED: "Non autorisé",
	NO_FIELDS_TO_UPDATE: "Aucun champ à mettre à jour",
	EMAIL_IS_THE_SAME: "L'adresse e-mail est identique",
};
