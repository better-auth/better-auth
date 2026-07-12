import type { BASE_ERROR_CODES } from "@better-auth/core/error";
import type { LocalizedTranslations } from "../../types";

export const frCore: LocalizedTranslations<typeof BASE_ERROR_CODES> = {
	ACCOUNT_NOT_FOUND: "Compte non trouvé",
	ASYNC_VALIDATION_NOT_SUPPORTED: "Async validation is not supported",
	BODY_MUST_BE_AN_OBJECT: "Body must be an object",
	CALLBACK_URL_REQUIRED: "callbackURL is required",
	CHANGE_EMAIL_DISABLED: "Change email is disabled",
	CREDENTIAL_ACCOUNT_NOT_FOUND: "Compte de connexion non trouvé",
	CROSS_SITE_NAVIGATION_LOGIN_BLOCKED:
		"Cross-site navigation login blocked. This request appears to be a CSRF attack.",
	EMAIL_ALREADY_VERIFIED: "L'adresse e-mail est déjà vérifiée",
	EMAIL_CAN_NOT_BE_UPDATED: "L'adresse e-mail ne peut pas être mise à jour",
	EMAIL_MISMATCH: "Discordance d'adresses e-mail",
	EMAIL_NOT_VERIFIED: "Adresse e-mail non vérifiée",
	FAILED_TO_CREATE_SESSION: "Échec de la création de la session",
	FAILED_TO_CREATE_USER: "Échec de la création de l'utilisateur",
	FAILED_TO_CREATE_VERIFICATION: "Unable to create verification",
	FAILED_TO_GET_SESSION: "Échec de la récupération de la session",
	FAILED_TO_GET_USER_INFO:
		"Échec de la récupération des informations utilisateur",
	FAILED_TO_UNLINK_LAST_ACCOUNT:
		"Vous ne pouvez pas dissocier votre dernier compte",
	FAILED_TO_UPDATE_USER: "Échec de la mise à jour de l'utilisateur",
	FIELD_NOT_ALLOWED: "Field not allowed to be set",
	ID_TOKEN_NOT_SUPPORTED: "id_token not supported",
	INVALID_CALLBACK_URL: "Invalid callbackURL",
	INVALID_EMAIL: "Adresse e-mail invalide",
	INVALID_EMAIL_OR_PASSWORD: "Email ou mot de passe invalide",
	INVALID_ERROR_CALLBACK_URL: "Invalid errorCallbackURL",
	INVALID_NEW_USER_CALLBACK_URL: "Invalid newUserCallbackURL",
	INVALID_ORIGIN: "Invalid origin",
	INVALID_PASSWORD: "Mot de passe invalide",
	INVALID_REDIRECT_URL: "Invalid redirectURL",
	INVALID_TOKEN: "Jeton invalide",
	INVALID_USER: "Utilisateur invalide",
	LINKED_ACCOUNT_ALREADY_EXISTS: "Le compte lié existe déjà",
	METHOD_NOT_ALLOWED_DEFER_SESSION_REQUIRED:
		"POST method requires deferSessionRefresh to be enabled in session config",
	MISSING_FIELD: "Ce champ est requis",
	MISSING_OR_NULL_ORIGIN: "Missing or null Origin",
	PASSWORD_ALREADY_SET: "L'utilisateur a déjà un mot de passe défini",
	PASSWORD_TOO_LONG: "Mot de passe trop long",
	PASSWORD_TOO_SHORT: "Mot de passe trop court",
	PROVIDER_NOT_FOUND: "Fournisseur non trouvé",
	SESSION_EXPIRED:
		"Session expirée. Veuillez vous reconnecter pour effectuer cette action.",
	SESSION_NOT_FRESH: "La session n'est pas récente",
	SOCIAL_ACCOUNT_ALREADY_LINKED: "Compte social déjà lié",
	TOKEN_EXPIRED: "Jeton expiré",
	USER_ALREADY_EXISTS: "L'utilisateur existe déjà",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"L'utilisateur existe déjà. Utilisez une autre adresse e-mail.",
	USER_ALREADY_HAS_PASSWORD:
		"L'utilisateur a déjà un mot de passe. Fournissez-le pour supprimer le compte.",
	USER_EMAIL_NOT_FOUND: "Adresse e-mail de l'utilisateur non trouvée",
	USER_NOT_FOUND: "Utilisateur non trouvé",
	VALIDATION_ERROR: "Erreur de validation",
	VERIFICATION_EMAIL_NOT_ENABLED: "L'e-mail de vérification n'est pas activé",
};
