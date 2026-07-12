import type { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins/two-factor";
import type { LocalizedTranslations } from "../../../types";

export const idTwoFactor: LocalizedTranslations<typeof TWO_FACTOR_ERROR_CODES> =
	{
		OTP_NOT_ENABLED: "OTP tidak diaktifkan",
		OTP_NOT_CONFIGURED: "OTP tidak dikonfigurasi",
		OTP_HAS_EXPIRED: "OTP telah kedaluwarsa",
		TOTP_NOT_ENABLED: "TOTP tidak diaktifkan",
		TOTP_NOT_CONFIGURED: "TOTP tidak dikonfigurasi",
		TWO_FACTOR_NOT_ENABLED: "Autentikasi dua faktor tidak diaktifkan",
		BACKUP_CODES_NOT_ENABLED: "Kode cadangan tidak diaktifkan",
		INVALID_BACKUP_CODE: "Kode cadangan tidak valid atau sudah digunakan.",
		INVALID_CODE: "Kode yang Anda masukkan tidak valid. Periksa dan coba lagi.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"Terlalu banyak percobaan. Silakan minta kode baru.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"Terlalu banyak percobaan verifikasi yang gagal. Akun Anda sementara dikunci. Silakan coba lagi nanti.",
		INVALID_TWO_FACTOR_COOKIE: "Cookie autentikasi dua faktor tidak valid",
	};
