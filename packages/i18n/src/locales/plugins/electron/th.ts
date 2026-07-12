import type { ELECTRON_ERROR_CODES } from "@better-auth/electron";
import type { LocalizedTranslations } from "../../../types";

export const thElectron: LocalizedTranslations<typeof ELECTRON_ERROR_CODES> = {
	INVALID_CLIENT_ID: "รหัสไคลเอนต์ไม่ถูกต้อง",
	INVALID_TOKEN: "โทเคนไม่ถูกต้องหรือหมดอายุ",
	STATE_MISMATCH: "สถานะไม่ตรงกัน (state mismatch)",
	MISSING_CODE_CHALLENGE: "ขาดข้อมูล code challenge",
	INVALID_CODE_VERIFIER: "ข้อมูลตัวยืนยันรหัสไม่ถูกต้อง",
	MISSING_STATE: "จำเป็นต้องระบุสถานะ (state)",
	MISSING_PKCE: "จำเป็นต้องระบุ PKCE",
};
