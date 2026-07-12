import type { USERNAME_ERROR_CODES } from "better-auth/plugins/username";
import type { LocalizedTranslations } from "../../../types";

export const thUsername: LocalizedTranslations<typeof USERNAME_ERROR_CODES> = {
	INVALID_USERNAME_OR_PASSWORD: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
	EMAIL_NOT_VERIFIED: "ยังไม่ได้ยืนยันอีเมล",
	UNEXPECTED_ERROR: "เกิดข้อผิดพลาดที่ไม่คาดคิด",
	USERNAME_IS_ALREADY_TAKEN: "ชื่อผู้ใช้นี้ถูกใช้งานแล้ว กรุณาลองชื่ออื่น",
	USERNAME_TOO_SHORT: "ชื่อผู้ใช้สั้นเกินไป",
	USERNAME_TOO_LONG: "ชื่อผู้ใช้ยาวเกินไป",
	INVALID_USERNAME: "ชื่อผู้ใช้ไม่ถูกต้อง",
	INVALID_DISPLAY_USERNAME: "ชื่อที่แสดงไม่ถูกต้อง",
	USERNAME_IS_IMMUTABLE: "ไม่สามารถอัปเดตชื่อผู้ใช้ได้",
};
