import type { PHONE_NUMBER_ERROR_CODES } from "better-auth/plugins/phone-number";
import type { LocalizedTranslations } from "../../../types";

export const trPhoneNumber: LocalizedTranslations<
	typeof PHONE_NUMBER_ERROR_CODES
> = {
	INVALID_PHONE_NUMBER: "Geçersiz telefon numarası",
	PHONE_NUMBER_EXIST: "Telefon numarası zaten mevcut",
	PHONE_NUMBER_NOT_EXIST: "Telefon numarası kayıtlı değil",
	INVALID_PHONE_NUMBER_OR_PASSWORD: "Geçersiz telefon numarası veya şifre",
	UNEXPECTED_ERROR: "Beklenmeyen hata",
	OTP_NOT_FOUND: "OTP bulunamadı",
	OTP_EXPIRED: "OTP süresi doldu",
	INVALID_OTP: "Geçersiz OTP",
	PHONE_NUMBER_NOT_VERIFIED: "Telefon numarası doğrulanmadı",
	PHONE_NUMBER_CANNOT_BE_UPDATED: "Telefon numarası güncellenemiyor",
	SEND_OTP_NOT_IMPLEMENTED: "sendOTP uygulanmadı",
	TOO_MANY_ATTEMPTS: "Çok fazla deneme. Lütfen daha sonra tekrar deneyin.",
};
