import type { PASSKEY_ERROR_CODES } from "@better-auth/passkey";
import type { LocalizedTranslations } from "../../../types";

export const frPasskey: LocalizedTranslations<typeof PASSKEY_ERROR_CODES> = {
	CHALLENGE_NOT_FOUND: "Défi non trouvé",
	YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
		"Vous n'êtes pas autorisé à enregistrer cette clé de sécurité",
	FAILED_TO_VERIFY_REGISTRATION: "Échec de la vérification de l'enregistrement",
	PASSKEY_NOT_FOUND: "Clé de sécurité non trouvée",
	AUTHENTICATION_FAILED: "Échec de l'authentification",
	UNABLE_TO_CREATE_SESSION: "Impossible de créer la session",
	FAILED_TO_UPDATE_PASSKEY: "Échec de la mise à jour de la clé de sécurité",
	PREVIOUSLY_REGISTERED: "Déjà enregistré",
	REGISTRATION_CANCELLED: "Enregistrement annulé",
	AUTH_CANCELLED: "Authentification annulée",
	UNKNOWN_ERROR: "Erreur inconnue",
	SESSION_REQUIRED:
		"L'enregistrement de la clé de sécurité nécessite une session authentifiée",
	RESOLVE_USER_REQUIRED:
		"L'enregistrement de la clé de sécurité nécessite soit une session authentifiée, soit un rappel resolveUser lorsque requireSession est défini sur false",
	RESOLVED_USER_INVALID: "L'utilisateur résolu n'est pas valide",
};
