import type { PHONE_NUMBER_ERROR_CODES } from "better-auth/plugins/phone-number";
import type { LocalizedTranslations } from "../../../types";

export const nlPhoneNumber: LocalizedTranslations<
	typeof PHONE_NUMBER_ERROR_CODES
> = {
	INVALID_PHONE_NUMBER: "Ongeldig telefoonnummer",
	PHONE_NUMBER_EXIST: "Telefoonnummer bestaat al",
	PHONE_NUMBER_NOT_EXIST: "Telefoonnummer is niet geregistreerd",
	INVALID_PHONE_NUMBER_OR_PASSWORD: "Ongeldig telefoonnummer of wachtwoord",
	UNEXPECTED_ERROR: "Onverwachte fout",
	OTP_NOT_FOUND: "OTP niet gevonden",
	OTP_EXPIRED: "OTP is verlopen",
	INVALID_OTP: "Ongeldige OTP",
	PHONE_NUMBER_NOT_VERIFIED: "Telefoonnummer niet geverifieerd",
	PHONE_NUMBER_CANNOT_BE_UPDATED:
		"Het telefoonnummer kan niet worden bijgewerkt",
	SEND_OTP_NOT_IMPLEMENTED: "sendOTP niet geïmplementeerd",
	TOO_MANY_ATTEMPTS: "Te veel pogingen. Probeer het later opnieuw.",
};
