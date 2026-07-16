import type { DEVICE_AUTHORIZATION_ERROR_CODES } from "better-auth/plugins/device-authorization";
import type { LocalizedTranslations } from "../../../types";

export const idDeviceAuthorization: LocalizedTranslations<
	typeof DEVICE_AUTHORIZATION_ERROR_CODES
> = {
	INVALID_DEVICE_CODE: "Kode perangkat tidak valid",
	EXPIRED_DEVICE_CODE: "Kode perangkat telah kedaluwarsa",
	EXPIRED_USER_CODE: "Kode pengguna telah kedaluwarsa",
	AUTHORIZATION_PENDING: "Otorisasi tertunda",
	ACCESS_DENIED: "Akses ditolak",
	INVALID_USER_CODE: "Kode pengguna tidak valid",
	DEVICE_CODE_ALREADY_PROCESSED: "Kode perangkat sudah diproses",
	DEVICE_CODE_NOT_CLAIMED:
		"Kode perangkat belum diklaim oleh sesi verifikasi; panggil `GET /device` dengan `user_code` saat masuk sebelum menyetujui hoặc menolak",
	POLLING_TOO_FREQUENTLY: "Polling terlalu sering",
	USER_NOT_FOUND: "Pengguna tidak ditemukan",
	FAILED_TO_CREATE_SESSION: "Gagal membuat sesi",
	INVALID_DEVICE_CODE_STATUS: "Status kode perangkat tidak valid",
	AUTHENTICATION_REQUIRED: "Autentikasi diperlukan",
};
