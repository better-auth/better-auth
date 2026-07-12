import type { ADMIN_ERROR_CODES } from "better-auth/plugins/admin";
import type { LocalizedTranslations } from "../../../types";

export const thAdmin: LocalizedTranslations<typeof ADMIN_ERROR_CODES> = {
	FAILED_TO_CREATE_USER: "สร้างผู้ใช้ไม่สำเร็จ",
	USER_ALREADY_EXISTS: "ผู้ใช้มีอยู่แล้ว",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "ผู้ใช้มีอยู่แล้ว กรุณาใช้อีเมลอื่น",
	YOU_CANNOT_BAN_YOURSELF: "คุณไม่สามารถแบนตัวเองได้",
	YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE: "คุณไม่ได้รับอนุญาตให้เปลี่ยนบทบาทของผู้ใช้",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "คุณไม่ได้รับอนุญาตให้สร้างผู้ใช้",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: "คุณไม่ได้รับอนุญาตให้แสดงรายการผู้ใช้",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
		"คุณไม่ได้รับอนุญาตให้แสดงรายการเซสชันของผู้ใช้",
	YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "คุณไม่ได้รับอนุญาตให้แบนผู้ใช้",
	YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS: "คุณไม่ได้รับอนุญาตให้สวมบทบาทเป็นผู้ใช้",
	YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
		"คุณไม่ได้รับอนุญาตให้เพิกถอนเซสชันของผู้ใช้",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: "คุณไม่ได้รับอนุญาตให้ลบผู้ใช้",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD: "คุณไม่ได้รับอนุญาตให้ตั้งรหัสผ่านของผู้ใช้",
	BANNED_USER: "คุณถูกแบนจากแอปพลิเคชันนี้",
	YOU_ARE_NOT_ALLOWED_TO_GET_USER: "คุณไม่ได้รับอนุญาตให้ดึงข้อมูลผู้ใช้",
	NO_DATA_TO_UPDATE: "ไม่มีข้อมูลสำหรับอัปเดต",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: "คุณไม่ได้รับอนุญาตให้อัปเดตผู้ใช้",
	YOU_CANNOT_REMOVE_YOURSELF: "คุณไม่สามารถลบตัวเองออกได้",
	YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
		"คุณไม่ได้รับอนุญาตให้ตั้งค่าบทบาทที่ไม่มีอยู่จริง",
	YOU_CANNOT_IMPERSONATE_ADMINS: "คุณไม่สามารถสวมบทบาทเป็นผู้ดูแลระบบได้",
	INVALID_ROLE_TYPE: "ประเภทบทบาทไม่ถูกต้อง",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL: "คุณไม่ได้รับอนุญาตให้อัปเดตอีเมลของผู้ใช้",
	PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
		"ไม่สามารถอัปเดตรหัสผ่านผ่านการอัปเดตผู้ใช้ได้ กรุณาใช้จุดปลายทาง set-user-password แทน",
};
