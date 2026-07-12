import type { PHONE_NUMBER_ERROR_CODES } from "better-auth/plugins/phone-number";
import type { LocalizedTranslations } from "../../../types";

export const plPhoneNumber: LocalizedTranslations<
	typeof PHONE_NUMBER_ERROR_CODES
> = {
	INVALID_PHONE_NUMBER: "Nieprawidłowy numer telefonu",
	PHONE_NUMBER_EXIST: "Numer telefonu już istnieje",
	PHONE_NUMBER_NOT_EXIST: "Numer telefonu nie jest zarejestrowany",
	INVALID_PHONE_NUMBER_OR_PASSWORD: "Nieprawidłowy numer telefonu lub hasło",
	UNEXPECTED_ERROR: "Nieoczekiwany błąd",
	OTP_NOT_FOUND: "OTP nie znaleziono",
	OTP_EXPIRED: "OTP wygasł",
	INVALID_OTP: "Nieprawidłowy OTP",
	PHONE_NUMBER_NOT_VERIFIED: "Numer telefonu nie jest zweryfikowany",
	PHONE_NUMBER_CANNOT_BE_UPDATED:
		"Numer telefonu nie może zostać zaktualizowany",
	SEND_OTP_NOT_IMPLEMENTED: "sendOTP nie jest zaimplementowane",
	TOO_MANY_ATTEMPTS: "Zbyt wiele prób. Spróbuj ponownie później.",
};
