import type { API_KEY_ERROR_CODES } from "@better-auth/api-key";
import type { LocalizedTranslations } from "../../../types";

export const frApiKey: LocalizedTranslations<typeof API_KEY_ERROR_CODES> = {
	INVALID_METADATA_TYPE:
		"les métadonnées doivent être un objet ou non définies",
	REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
		"refillAmount est requis lorsque refillInterval est fourni",
	REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
		"refillInterval est requis lorsque refillAmount est fourni",
	USER_BANNED: "L'utilisateur est banni",
	UNAUTHORIZED_SESSION: "Session non autorisée ou invalide",
	KEY_NOT_FOUND: "Clé API non trouvée",
	KEY_DISABLED: "La clé API est désactivée",
	KEY_EXPIRED: "La clé API a expiré",
	USAGE_EXCEEDED: "La clé API a atteint sa limite d'utilisation",
	KEY_NOT_RECOVERABLE: "La clé API n'est pas récupérable",
	EXPIRES_IN_IS_TOO_SMALL:
		"La valeur expiresIn est plus petite que la valeur minimale prédéfinie.",
	EXPIRES_IN_IS_TOO_LARGE:
		"La valeur expiresIn est plus grande que la valeur maximale prédéfinie.",
	INVALID_REMAINING: "Le nombre restant est soit trop grand, soit trop petit.",
	INVALID_PREFIX_LENGTH:
		"La longueur du préfixe est soit trop grande, soit trop petite.",
	INVALID_NAME_LENGTH:
		"La longueur du nom est soit trop grande, soit trop petite.",
	METADATA_DISABLED: "Les métadonnées sont désactivées.",
	RATE_LIMIT_EXCEEDED: "Limite de débit dépassée.",
	NO_VALUES_TO_UPDATE: "Aucune valeur à mettre à jour.",
	KEY_DISABLED_EXPIRATION:
		"Les valeurs d'expiration de clé personnalisées sont désactivées.",
	INVALID_API_KEY: "Clé API invalide.",
	INVALID_USER_ID_FROM_API_KEY: "L'ID utilisateur de la clé API est invalide.",
	INVALID_REFERENCE_ID_FROM_API_KEY:
		"L'ID de référence de la clé API est invalide.",
	INVALID_API_KEY_GETTER_RETURN_TYPE:
		"Le getter de clé API a renvoyé un type de clé invalide. Chaîne attendue.",
	SERVER_ONLY_PROPERTY:
		"La propriété que vous tentez de définir ne peut être définie que depuis l'instance d'authentification du serveur.",
	FAILED_TO_UPDATE_API_KEY: "Échec de la mise à jour de la clé API",
	NAME_REQUIRED: "Le nom de la clé API est requis.",
	ORGANIZATION_ID_REQUIRED:
		"L'ID de l'organisation est requis pour les clés API appartenant à une organisation.",
	USER_NOT_MEMBER_OF_ORGANIZATION:
		"Vous n'êtes pas membre de l'organisation qui possède cette clé API.",
	INSUFFICIENT_API_KEY_PERMISSIONS:
		"Vous n'avez pas l'autorisation d'effectuer cette action sur les clés API de l'organisation.",
	NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
		"Aucune configuration de clé API par défaut trouvée.",
	ORGANIZATION_PLUGIN_REQUIRED:
		"Le plugin d'organisation est requis pour les clés API appartenant à l'organisation. Veuillez installer et configurer le plugin d'organisation.",
};
