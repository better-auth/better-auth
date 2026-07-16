import type { USERNAME_ERROR_CODES } from "better-auth/plugins/username";
import type { LocalizedTranslations } from "../../../types";

export const idUsername: LocalizedTranslations<typeof USERNAME_ERROR_CODES> = {
	INVALID_USERNAME_OR_PASSWORD: "Nama pengguna atau kata sandi tidak valid",
	EMAIL_NOT_VERIFIED: "Email belum diverifikasi",
	UNEXPECTED_ERROR: "Kesalahan tak terduga",
	USERNAME_IS_ALREADY_TAKEN:
		"Nama pengguna sudah digunakan. Silakan coba yang lain.",
	USERNAME_TOO_SHORT: "Nama pengguna terlalu pendek",
	USERNAME_TOO_LONG: "Nama pengguna terlalu panjang",
	INVALID_USERNAME: "Nama pengguna tidak valid",
	INVALID_DISPLAY_USERNAME: "Nama tampilan tidak valid",
	USERNAME_IS_IMMUTABLE: "Nama pengguna tidak dapat diperbarui",
};
