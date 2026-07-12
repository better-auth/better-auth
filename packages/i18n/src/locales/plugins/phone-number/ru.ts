import type { PHONE_NUMBER_ERROR_CODES } from "better-auth/plugins/phone-number";
import type { LocalizedTranslations } from "../../../types";

export const ruPhoneNumber: LocalizedTranslations<
	typeof PHONE_NUMBER_ERROR_CODES
> = {
	INVALID_PHONE_NUMBER: "Неверный номер телефона",
	PHONE_NUMBER_EXIST: "Номер телефона уже существует",
	PHONE_NUMBER_NOT_EXIST: "Номер телефона не зарегистрирован",
	INVALID_PHONE_NUMBER_OR_PASSWORD: "Неверный номер телефона или пароль",
	UNEXPECTED_ERROR: "Неожиданная ошибка",
	OTP_NOT_FOUND: "OTP не найден",
	OTP_EXPIRED: "OTP истёк",
	INVALID_OTP: "Неверный OTP",
	PHONE_NUMBER_NOT_VERIFIED: "Номер телефона не подтверждён",
	PHONE_NUMBER_CANNOT_BE_UPDATED: "Номер телефона не может быть обновлён",
	SEND_OTP_NOT_IMPLEMENTED: "sendOTP не реализован",
	TOO_MANY_ATTEMPTS: "Слишком много попыток. Попробуйте позже.",
};
