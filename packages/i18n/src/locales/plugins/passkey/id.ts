import type { PASSKEY_ERROR_CODES } from "@better-auth/passkey";
import type { LocalizedTranslations } from "../../../types";

export const idPasskey: LocalizedTranslations<typeof PASSKEY_ERROR_CODES> = {
	CHALLENGE_NOT_FOUND: "Tantangan tidak ditemukan",
	YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
		"Anda tidak diizinkan untuk mendaftarkan passkey ini",
	FAILED_TO_VERIFY_REGISTRATION: "Gagal memverifikasi pendaftaran",
	PASSKEY_NOT_FOUND: "Passkey tidak ditemukan",
	AUTHENTICATION_FAILED: "Autentikasi gagal",
	UNABLE_TO_CREATE_SESSION: "Tidak dapat membuat sesi",
	FAILED_TO_UPDATE_PASSKEY: "Gagal memperbarui passkey",
	PREVIOUSLY_REGISTERED: "Sebelumnya telah terdaftar",
	REGISTRATION_CANCELLED: "Pendaftaran dibatalkan",
	AUTH_CANCELLED: "Autentikasi dibatalkan",
	UNKNOWN_ERROR: "Kesalahan tidak dikenal",
	SESSION_REQUIRED: "Pendaftaran passkey memerlukan sesi terautentikasi",
	RESOLVE_USER_REQUIRED:
		"Pendaftaran passkey memerlukan sesi terautentikasi atau callback resolveUser ketika requireSession bernilai false",
	RESOLVED_USER_INVALID: "Pengguna yang diselesaikan tidak valid",
};
