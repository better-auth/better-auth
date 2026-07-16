import type { ELECTRON_ERROR_CODES } from "@better-auth/electron";
import type { LocalizedTranslations } from "../../../types";

export const idElectron: LocalizedTranslations<typeof ELECTRON_ERROR_CODES> = {
	INVALID_CLIENT_ID: "ID klien tidak valid",
	INVALID_TOKEN: "Token tidak valid atau kedaluwarsa.",
	STATE_MISMATCH: "Ketidakcocokan status (state)",
	MISSING_CODE_CHALLENGE: "Tantangan kode (code challenge) tidak ditemukan",
	INVALID_CODE_VERIFIER: "Pengverifikasi kode tidak valid",
	MISSING_STATE: "Status (state) diperlukan",
	MISSING_PKCE: "PKCE diperlukan",
};
