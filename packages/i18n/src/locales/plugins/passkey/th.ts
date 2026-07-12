import type { PASSKEY_ERROR_CODES } from "@better-auth/passkey";
import type { LocalizedTranslations } from "../../../types";

export const thPasskey: LocalizedTranslations<typeof PASSKEY_ERROR_CODES> = {
	CHALLENGE_NOT_FOUND: "ไม่พบคำขอท้าทาย",
	YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: "คุณไม่ได้รับอนุญาตให้ลงทะเบียนพาสคีย์นี้",
	FAILED_TO_VERIFY_REGISTRATION: "การยืนยันการลงทะเบียนล้มเหลว",
	PASSKEY_NOT_FOUND: "ไม่พบพาสคีย์",
	AUTHENTICATION_FAILED: "การยืนยันตัวตนล้มเหลว",
	UNABLE_TO_CREATE_SESSION: "ไม่สามารถสร้างเซสชันได้",
	FAILED_TO_UPDATE_PASSKEY: "อัปเดตพาสคีย์ล้มเหลว",
	PREVIOUSLY_REGISTERED: "ลงทะเบียนไว้ก่อนหน้านี้แล้ว",
	REGISTRATION_CANCELLED: "การลงทะเบียนถูกยกเลิก",
	AUTH_CANCELLED: "การยืนยันตัวตนถูกยกเลิก",
	UNKNOWN_ERROR: "เกิดข้อผิดพลาดที่ไม่รู้จัก",
	SESSION_REQUIRED: "การลงทะเบียนพาสคีย์จำเป็นต้องมีเซสชันที่ได้รับการยืนยันตัวตนแล้ว",
	RESOLVE_USER_REQUIRED:
		"การลงทะเบียนพาสคีย์จำเป็นต้องมีเซสชันที่ยืนยันตัวตนแล้ว หรือมีคอลแบ็ก resolveUser เมื่อ requireSession เป็น false",
	RESOLVED_USER_INVALID: "ผู้ใช้ที่ระบุไม่ถูกต้อง",
};
