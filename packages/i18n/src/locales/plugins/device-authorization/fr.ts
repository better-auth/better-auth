import type { DEVICE_AUTHORIZATION_ERROR_CODES } from "better-auth/plugins/device-authorization";
import type { LocalizedTranslations } from "../../../types";

export const frDeviceAuthorization: LocalizedTranslations<
	typeof DEVICE_AUTHORIZATION_ERROR_CODES
> = {
	INVALID_DEVICE_CODE: "Code d'appareil invalide",
	EXPIRED_DEVICE_CODE: "Le code d'appareil a expiré",
	EXPIRED_USER_CODE: "Le code d'utilisateur a expiré",
	AUTHORIZATION_PENDING: "Autorisation en attente",
	ACCESS_DENIED: "Accès refusé",
	INVALID_USER_CODE: "Code d'utilisateur invalide",
	DEVICE_CODE_ALREADY_PROCESSED: "Code d'appareil déjà traité",
	DEVICE_CODE_NOT_CLAIMED:
		"Le code d'appareil n'a pas été réclamé par une session de vérification; appelez `GET /device` avec le `user_code` en étant connecté avant d'approuver ou de refuser",
	POLLING_TOO_FREQUENTLY: "Fréquence de sondage trop élevée",
	USER_NOT_FOUND: "Utilisateur non trouvé",
	FAILED_TO_CREATE_SESSION: "Échec de la création de la session",
	INVALID_DEVICE_CODE_STATUS: "Statut du code d'appareil invalide",
	AUTHENTICATION_REQUIRED: "Authentification requise",
};
