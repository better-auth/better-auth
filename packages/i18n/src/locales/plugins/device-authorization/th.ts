import type { DEVICE_AUTHORIZATION_ERROR_CODES } from "better-auth/plugins/device-authorization";
import type { LocalizedTranslations } from "../../../types";

export const thDeviceAuthorization: LocalizedTranslations<
	typeof DEVICE_AUTHORIZATION_ERROR_CODES
> = {
	INVALID_DEVICE_CODE: "รหัสอุปกรณ์ไม่ถูกต้อง",
	EXPIRED_DEVICE_CODE: "รหัสอุปกรณ์หมดอายุแล้ว",
	EXPIRED_USER_CODE: "รหัสผู้ใช้หมดอายุแล้ว",
	AUTHORIZATION_PENDING: "อยู่ระหว่างการพิจารณาอนุมัติ",
	ACCESS_DENIED: "การเข้าถึงถูกปฏิเสธ",
	INVALID_USER_CODE: "รหัสผู้ใช้ไม่ถูกต้อง",
	DEVICE_CODE_ALREADY_PROCESSED: "รหัสอุปกรณ์ได้รับการประมวลผลแล้ว",
	DEVICE_CODE_NOT_CLAIMED:
		"ยังไม่มีเซสชันการตรวจสอบอ้างสิทธิ์รหัสอุปกรณ์นี้; โปรดเรียกใช้ `GET /device` พร้อม `user_code` ในขณะที่ลงชื่อเข้าใช้ก่อนที่จะอนุมัติหรือปฏิเสธ",
	POLLING_TOO_FREQUENTLY: "ส่งคำร้องขอถี่เกินไป",
	USER_NOT_FOUND: "ไม่พบผู้ใช้",
	FAILED_TO_CREATE_SESSION: "สร้างเซสชันไม่สำเร็จ",
	INVALID_DEVICE_CODE_STATUS: "สถานะรหัสอุปกรณ์ไม่ถูกต้อง",
	AUTHENTICATION_REQUIRED: "จำเป็นต้องมีการยืนยันตัวตน",
};
