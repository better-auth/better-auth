import type { PHONE_NUMBER_ERROR_CODES } from "better-auth/plugins/phone-number";
import type { LocalizedTranslations } from "../../../types";

export const idPhoneNumber: LocalizedTranslations<
	typeof PHONE_NUMBER_ERROR_CODES
> = {
	INVALID_PHONE_NUMBER: "Nomor telepon tidak valid",
	PHONE_NUMBER_EXIST: "Nomor telepon sudah ada",
	PHONE_NUMBER_NOT_EXIST: "Nomor telepon tidak terdaftar",
	INVALID_PHONE_NUMBER_OR_PASSWORD: "Nomor telepon atau kata sandi tidak valid",
	UNEXPECTED_ERROR: "Terjadi kesalahan yang tidak terduga",
	OTP_NOT_FOUND: "OTP tidak ditemukan",
	OTP_EXPIRED: "OTP telah kedaluwarsa",
	INVALID_OTP: "OTP tidak valid",
	PHONE_NUMBER_NOT_VERIFIED: "Nomor telepon belum diverifikasi",
	PHONE_NUMBER_CANNOT_BE_UPDATED: "Nomor telepon tidak dapat diperbarui",
	SEND_OTP_NOT_IMPLEMENTED: "sendOTP belum diimplementasikan",
	TOO_MANY_ATTEMPTS: "Terlalu banyak percobaan. Silakan coba lagi nanti.",
};
