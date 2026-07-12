import type { PHONE_NUMBER_ERROR_CODES } from "better-auth/plugins/phone-number";
import type { LocalizedTranslations } from "../../../types";

export const ukPhoneNumber: LocalizedTranslations<
	typeof PHONE_NUMBER_ERROR_CODES
> = {
	INVALID_PHONE_NUMBER: "Недійсний номер телефону",
	PHONE_NUMBER_EXIST: "Номер телефону вже існує",
	PHONE_NUMBER_NOT_EXIST: "Номер телефону не зареєстровано",
	INVALID_PHONE_NUMBER_OR_PASSWORD: "Недійсний номер телефону або пароль",
	UNEXPECTED_ERROR: "Несподівана помилка",
	OTP_NOT_FOUND: "OTP не знайдено",
	OTP_EXPIRED: "OTP закінчився",
	INVALID_OTP: "Недійсний OTP",
	PHONE_NUMBER_NOT_VERIFIED: "Номер телефону не підтверджено",
	PHONE_NUMBER_CANNOT_BE_UPDATED: "Номер телефону не може бути оновлено",
	SEND_OTP_NOT_IMPLEMENTED: "sendOTP не реалізовано",
	TOO_MANY_ATTEMPTS: "Забагато спроб. Будь ласка, спробуйте пізніше.",
};
