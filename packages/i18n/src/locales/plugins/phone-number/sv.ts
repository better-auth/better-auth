import type { PHONE_NUMBER_ERROR_CODES } from "better-auth/plugins/phone-number";
import type { LocalizedTranslations } from "../../../types";

export const svPhoneNumber: LocalizedTranslations<
	typeof PHONE_NUMBER_ERROR_CODES
> = {
	INVALID_PHONE_NUMBER: "Ogiltigt telefonnummer",
	PHONE_NUMBER_EXIST: "Telefonnumret finns redan",
	PHONE_NUMBER_NOT_EXIST: "Telefonnumret är inte registrerat",
	INVALID_PHONE_NUMBER_OR_PASSWORD: "Ogiltigt telefonnummer eller lösenord",
	UNEXPECTED_ERROR: "Oväntat fel",
	OTP_NOT_FOUND: "OTP hittades inte",
	OTP_EXPIRED: "OTP har gått ut",
	INVALID_OTP: "Ogiltig OTP",
	PHONE_NUMBER_NOT_VERIFIED: "Telefonnumret är inte verifierat",
	PHONE_NUMBER_CANNOT_BE_UPDATED: "Telefonnumret kan inte uppdateras",
	SEND_OTP_NOT_IMPLEMENTED: "sendOTP inte implementerat",
	TOO_MANY_ATTEMPTS: "För många försök. Försök igen senare.",
};
