import type { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins/two-factor";
import type { LocalizedTranslations } from "../../../types";

export const thTwoFactor: LocalizedTranslations<typeof TWO_FACTOR_ERROR_CODES> =
	{
		OTP_NOT_ENABLED: "OTP ยังไม่ได้เปิดใช้งาน",
		OTP_NOT_CONFIGURED: "OTP ยังไม่ได้ตั้งค่า",
		OTP_HAS_EXPIRED: "OTP หมดอายุแล้ว",
		TOTP_NOT_ENABLED: "TOTP ยังไม่ได้เปิดใช้งาน",
		TOTP_NOT_CONFIGURED: "TOTP ยังไม่ได้ตั้งค่า",
		TWO_FACTOR_NOT_ENABLED: "การยืนยันตัวตนสองปัจจัยยังไม่ได้เปิดใช้งาน",
		BACKUP_CODES_NOT_ENABLED: "รหัสสำรองยังไม่ได้เปิดใช้งาน",
		INVALID_BACKUP_CODE: "รหัสสำรองไม่ถูกต้องหรือถูกใช้ไปแล้ว",
		INVALID_CODE: "รหัสที่คุณกรอกไม่ถูกต้อง กรุณาตรวจสอบและลองอีกครั้ง",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "พยายามมากเกินไป กรุณาขอรหัสใหม่",
		ACCOUNT_TEMPORARILY_LOCKED:
			"การยืนยันตัวตนล้มเหลวหลายครั้ง บัญชีของคุณถูกล็อกชั่วคราว กรุณาลองใหม่ในภายหลัง",
		INVALID_TWO_FACTOR_COOKIE: "คุกกี้การยืนยันตัวตนสองปัจจัยไม่ถูกต้อง",
	};
