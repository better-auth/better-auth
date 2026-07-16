import type { PHONE_NUMBER_ERROR_CODES } from "better-auth/plugins/phone-number";
import type { LocalizedTranslations } from "../../../types";

export const itPhoneNumber: LocalizedTranslations<
	typeof PHONE_NUMBER_ERROR_CODES
> = {
	INVALID_PHONE_NUMBER: "Numero di telefono non valido",
	PHONE_NUMBER_EXIST: "Il numero di telefono esiste già",
	PHONE_NUMBER_NOT_EXIST: "Il numero di telefono non è registrato",
	INVALID_PHONE_NUMBER_OR_PASSWORD: "Numero di telefono o password non validi",
	UNEXPECTED_ERROR: "Errore imprevisto",
	OTP_NOT_FOUND: "OTP non trovato",
	OTP_EXPIRED: "OTP scaduto",
	INVALID_OTP: "OTP non valido",
	PHONE_NUMBER_NOT_VERIFIED: "Numero di telefono non verificado",
	PHONE_NUMBER_CANNOT_BE_UPDATED:
		"Il numero di telefono não può essere aggiornato",
	SEND_OTP_NOT_IMPLEMENTED: "sendOTP non implementato",
	TOO_MANY_ATTEMPTS: "Troppi tentativi. Riprova più tardi.",
};
