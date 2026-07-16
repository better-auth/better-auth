import type { PHONE_NUMBER_ERROR_CODES } from "better-auth/plugins/phone-number";
import type { LocalizedTranslations } from "../../../types";

export const dePhoneNumber: LocalizedTranslations<
	typeof PHONE_NUMBER_ERROR_CODES
> = {
	INVALID_PHONE_NUMBER: "Ungültige Telefonnummer",
	PHONE_NUMBER_EXIST: "Telefonnummer existiert bereits",
	PHONE_NUMBER_NOT_EXIST: "Telefonnummer ist nicht registriert",
	INVALID_PHONE_NUMBER_OR_PASSWORD: "Ungültige Telefonnummer oder Passwort",
	UNEXPECTED_ERROR: "Unerwarteter Fehler",
	OTP_NOT_FOUND: "OTP nicht gefunden",
	OTP_EXPIRED: "OTP ist abgelaufen",
	INVALID_OTP: "Ungültiges OTP",
	PHONE_NUMBER_NOT_VERIFIED: "Telefonnummer nicht verifiziert",
	PHONE_NUMBER_CANNOT_BE_UPDATED:
		"Die Telefonnummer kann nicht aktualisiert werden",
	SEND_OTP_NOT_IMPLEMENTED: "sendOTP nicht implementiert",
	TOO_MANY_ATTEMPTS:
		"Zu viele Versuche. Bitte versuchen Sie es später noch einmal.",
};
