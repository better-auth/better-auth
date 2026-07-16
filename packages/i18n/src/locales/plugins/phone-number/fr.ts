import type { PHONE_NUMBER_ERROR_CODES } from "better-auth/plugins/phone-number";
import type { LocalizedTranslations } from "../../../types";

export const frPhoneNumber: LocalizedTranslations<
	typeof PHONE_NUMBER_ERROR_CODES
> = {
	INVALID_PHONE_NUMBER: "Numéro de téléphone invalide",
	PHONE_NUMBER_EXIST: "Ce numéro de téléphone existe déjà",
	PHONE_NUMBER_NOT_EXIST: "Ce numéro de téléphone n'est pas enregistré",
	INVALID_PHONE_NUMBER_OR_PASSWORD:
		"Numéro de téléphone ou mot de passe invalide",
	UNEXPECTED_ERROR: "Erreur inattendue",
	OTP_NOT_FOUND: "Code OTP introuvable",
	OTP_EXPIRED: "Le code OTP a expiré",
	INVALID_OTP: "Code OTP invalide",
	PHONE_NUMBER_NOT_VERIFIED: "Numéro de téléphone non vérifié",
	PHONE_NUMBER_CANNOT_BE_UPDATED:
		"Le numéro de téléphone ne peut pas être mis à jour",
	SEND_OTP_NOT_IMPLEMENTED: "sendOTP non implémenté",
	TOO_MANY_ATTEMPTS: "Trop de tentatives. Veuillez réessayer plus tard.",
};
