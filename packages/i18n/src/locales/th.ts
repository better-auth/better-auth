import type { TranslationDictionary } from "../types";

/**
 * Thai translations
 */
export const th: TranslationDictionary = {
	USER_NOT_FOUND: "ไม่พบผู้ใช้",
	FAILED_TO_CREATE_USER: "สร้างผู้ใช้ไม่สำเร็จ",
	FAILED_TO_CREATE_SESSION: "สร้างเซสชันไม่สำเร็จ",
	FAILED_TO_UPDATE_USER: "อัปเดตผู้ใช้ไม่สำเร็จ",
	FAILED_TO_GET_SESSION: "ดึงเซสชันไม่สำเร็จ",
	INVALID_PASSWORD: "รหัสผ่านไม่ถูกต้อง",
	INVALID_EMAIL: "อีเมลไม่ถูกต้อง",
	INVALID_EMAIL_OR_PASSWORD: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
	INVALID_USER: "ผู้ใช้ไม่ถูกต้อง",
	SOCIAL_ACCOUNT_ALREADY_LINKED: "บัญชีโซเชียลเชื่อมต่อแล้ว",
	PROVIDER_NOT_FOUND: "ไม่พบผู้ให้บริการ",
	INVALID_TOKEN: "โทเคนไม่ถูกต้อง",
	TOKEN_EXPIRED: "โทเคนหมดอายุ",
	FAILED_TO_GET_USER_INFO: "ดึงข้อมูลผู้ใช้ไม่สำเร็จ",
	USER_EMAIL_NOT_FOUND: "ไม่พบอีเมลผู้ใช้",
	EMAIL_NOT_VERIFIED: "อีเมลยังไม่ได้รับการยืนยัน",
	PASSWORD_TOO_SHORT: "รหัสผ่านสั้นเกินไป",
	PASSWORD_TOO_LONG: "รหัสผ่านยาวเกินไป",
	USER_ALREADY_EXISTS: "ผู้ใช้มีอยู่แล้ว",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"ผู้ใช้มีอยู่แล้ว กรุณาใช้อีเมลอื่น",
	EMAIL_CAN_NOT_BE_UPDATED: "ไม่สามารถอัปเดตอีเมลได้",
	CREDENTIAL_ACCOUNT_NOT_FOUND: "ไม่พบบัญชีข้อมูลรับรอง",
	SESSION_EXPIRED:
		"เซสชันหมดอายุ กรุณายืนยันตัวตนใหม่เพื่อดำเนินการนี้",
	FAILED_TO_UNLINK_LAST_ACCOUNT:
		"คุณไม่สามารถยกเลิกการเชื่อมต่อบัญชีสุดท้ายของคุณได้",
	ACCOUNT_NOT_FOUND: "ไม่พบบัญชี",
	USER_ALREADY_HAS_PASSWORD:
		"ผู้ใช้มีรหัสผ่านอยู่แล้ว กรุณาระบุรหัสผ่านเพื่อลบบัญชี",
	VERIFICATION_EMAIL_NOT_ENABLED: "ไม่ได้เปิดใช้งานอีเมลยืนยัน",
	EMAIL_ALREADY_VERIFIED: "อีเมลได้รับการยืนยันแล้ว",
	EMAIL_MISMATCH: "อีเมลไม่ตรงกัน",
	SESSION_NOT_FRESH: "เซสชันไม่ใหม่",
	LINKED_ACCOUNT_ALREADY_EXISTS: "บัญชีที่เชื่อมต่อมีอยู่แล้ว",
	VALIDATION_ERROR: "ข้อผิดพลาดในการตรวจสอบ",
	MISSING_FIELD: "ต้องกรอกฟิลด์นี้",
	PASSWORD_ALREADY_SET: "ผู้ใช้มีรหัสผ่านที่ตั้งค่าไว้แล้ว",
};
