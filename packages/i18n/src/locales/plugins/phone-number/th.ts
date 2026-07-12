import type { PHONE_NUMBER_ERROR_CODES } from "better-auth/plugins/phone-number";
import type { LocalizedTranslations } from "../../../types";

export const thPhoneNumber: LocalizedTranslations<
	typeof PHONE_NUMBER_ERROR_CODES
> = {
	INVALID_PHONE_NUMBER: "หมายเลขโทรศัพท์ไม่ถูกต้อง",
	PHONE_NUMBER_EXIST: "หมายเลขโทรศัพท์นี้มีอยู่แล้ว",
	PHONE_NUMBER_NOT_EXIST: "หมายเลขโทรศัพท์ยังไม่ได้ลงทะเบียน",
	INVALID_PHONE_NUMBER_OR_PASSWORD: "หมายเลขโทรศัพท์หรือรหัสผ่านไม่ถูกต้อง",
	UNEXPECTED_ERROR: "เกิดข้อผิดพลาดที่ไม่คาดคิด",
	OTP_NOT_FOUND: "ไม่พบ OTP",
	OTP_EXPIRED: "OTP หมดอายุแล้ว",
	INVALID_OTP: "OTP ไม่ถูกต้อง",
	PHONE_NUMBER_NOT_VERIFIED: "หมายเลขโทรศัพท์ยังไม่ได้รับการยืนยัน",
	PHONE_NUMBER_CANNOT_BE_UPDATED: "ไม่สามารถอัปเดตหมายเลขโทรศัพท์ได้",
	SEND_OTP_NOT_IMPLEMENTED: "sendOTP ยังไม่ได้ถูกนำไปใช้",
	TOO_MANY_ATTEMPTS: "พยายามมากเกินไป กรุณาลองใหม่ในภายหลัง",
};
