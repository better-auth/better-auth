import type { API_KEY_ERROR_CODES } from "@better-auth/api-key";
import type { LocalizedTranslations } from "../../../types";

export const idApiKey: LocalizedTranslations<typeof API_KEY_ERROR_CODES> = {
	INVALID_METADATA_TYPE: "metadata harus berupa objek atau tidak ditentukan",
	REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
		"refillAmount diperlukan jika refillInterval disediakan",
	REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
		"refillInterval diperlukan jika refillAmount disediakan",
	USER_BANNED: "Pengguna diblokir",
	UNAUTHORIZED_SESSION: "Sesi tidak terotorisasi atau tidak valid",
	KEY_NOT_FOUND: "Kunci API tidak ditemukan",
	KEY_DISABLED: "Kunci API dinonaktifkan",
	KEY_EXPIRED: "Kunci API telah kedaluwarsa",
	USAGE_EXCEEDED: "Kunci API telah mencapai batas penggunaannya",
	KEY_NOT_RECOVERABLE: "Kunci API tidak dapat dipulihkan",
	EXPIRES_IN_IS_TOO_SMALL:
		"Nilai expiresIn lebih kecil dari nilai minimum yang ditentukan.",
	EXPIRES_IN_IS_TOO_LARGE:
		"Nilai expiresIn lebih besar dari nilai maksimum yang ditentukan.",
	INVALID_REMAINING: "Jumlah tersisa terlalu besar atau terlalu kecil.",
	INVALID_PREFIX_LENGTH: "Panjang prefiks terlalu besar atau terlalu kecil.",
	INVALID_NAME_LENGTH: "Panjang nama terlalu besar atau terlalu kecil.",
	METADATA_DISABLED: "Metadata dinonaktifkan.",
	RATE_LIMIT_EXCEEDED: "Batas kecepatan terlampaui.",
	NO_VALUES_TO_UPDATE: "Tidak ada nilai untuk diperbarui.",
	KEY_DISABLED_EXPIRATION: "Nilai kedaluwarsa kunci khusus dinonaktifkan.",
	INVALID_API_KEY: "Kunci API tidak valid.",
	INVALID_USER_ID_FROM_API_KEY: "ID pengguna dari kunci API tidak valid.",
	INVALID_REFERENCE_ID_FROM_API_KEY: "ID referensi dari kunci API tidak valid.",
	INVALID_API_KEY_GETTER_RETURN_TYPE:
		"Getter kunci API mengembalikan tipe kunci yang tidak valid. Diharapkan string.",
	SERVER_ONLY_PROPERTY:
		"Properti yang ingin Anda atur hanya dapat dikonfigurasi melalui instans auth server.",
	FAILED_TO_UPDATE_API_KEY: "Gagal memperbarui kunci API",
	NAME_REQUIRED: "Nama kunci API diperlukan.",
	ORGANIZATION_ID_REQUIRED:
		"ID Organisasi diperlukan untuk kunci API milik organisasi.",
	USER_NOT_MEMBER_OF_ORGANIZATION:
		"Anda bukan anggota organisasi pemilik kunci API ini.",
	INSUFFICIENT_API_KEY_PERMISSIONS:
		"Anda tidak memiliki izin untuk melakukan tindakan ini pada kunci API organisasi.",
	NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
		"Tidak ada konfigurasi kunci API default yang ditemukan.",
	ORGANIZATION_PLUGIN_REQUIRED:
		"Plugin organisasi diperlukan untuk kunci API milik organisasi. Silakan instal dan konfigurasi plugin organisasi.",
};
