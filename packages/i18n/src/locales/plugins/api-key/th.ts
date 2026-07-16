import type { API_KEY_ERROR_CODES } from "@better-auth/api-key";
import type { LocalizedTranslations } from "../../../types";

export const thApiKey: LocalizedTranslations<typeof API_KEY_ERROR_CODES> = {
	INVALID_METADATA_TYPE: "ข้อมูลเมตาต้องเป็นออบเจกต์หรือไม่ได้ระบุไว้",
	REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
		"จำเป็นต้องระบุ refillAmount เมื่อกำหนด refillInterval",
	REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
		"จำเป็นต้องระบุ refillInterval เมื่อกำหนด refillAmount",
	USER_BANNED: "ผู้ใช้ถูกระงับการใช้งาน",
	UNAUTHORIZED_SESSION: "เซสชันไม่ได้รับการยืนยันตัวตนหรือไม่ถูกต้อง",
	KEY_NOT_FOUND: "ไม่พบรหัส API Key",
	KEY_DISABLED: "API Key ถูกปิดใช้งาน",
	KEY_EXPIRED: "API Key หมดอายุแล้ว",
	USAGE_EXCEEDED: "API Key เกินขีดจำกัดการใช้งานแล้ว",
	KEY_NOT_RECOVERABLE: "API Key ไม่สามารถกู้คืนได้",
	EXPIRES_IN_IS_TOO_SMALL: "ค่า expiresIn น้อยกว่าค่าต่ำสุดที่กำหนดไว้ล่วงหน้า",
	EXPIRES_IN_IS_TOO_LARGE: "ค่า expiresIn มากกว่าค่าสูงสุดที่กำหนดไว้ล่วงหน้า",
	INVALID_REMAINING: "จำนวนการใช้งานที่เหลืออยู่มากเกินไปหรือน้อยเกินไป",
	INVALID_PREFIX_LENGTH: "ความยาวของคำนำหน้ายาวเกินไปหรือสั้นเกินไป",
	INVALID_NAME_LENGTH: "ความยาวของชื่อยาวเกินไปหรือสั้นเกินไป",
	METADATA_DISABLED: "ข้อมูลเมตาถูกปิดใช้งาน",
	RATE_LIMIT_EXCEEDED: "เกินขีดจำกัดการเรียกใช้งาน",
	NO_VALUES_TO_UPDATE: "ไม่มีค่าที่จะอัปเดต",
	KEY_DISABLED_EXPIRATION: "การกำหนดวันหมดอายุคีย์เองถูกปิดใช้งาน",
	INVALID_API_KEY: "API Key ไม่ถูกต้อง",
	INVALID_USER_ID_FROM_API_KEY: "User ID จาก API Key ไม่ถูกต้อง",
	INVALID_REFERENCE_ID_FROM_API_KEY: "Reference ID จาก API Key ไม่ถูกต้อง",
	INVALID_API_KEY_GETTER_RETURN_TYPE:
		"ฟังก์ชันดึงค่า API Key คืนค่าประเภทคีย์ที่ไม่ถูกต้อง คาดว่าเป็นสตริง",
	SERVER_ONLY_PROPERTY:
		"คุณสมบัติที่คุณพยายามกำหนดสามารถตั้งค่าได้จากอินสแตนซ์ auth ของเซิร์ฟเวอร์เท่านั้น",
	FAILED_TO_UPDATE_API_KEY: "อัปเดต API Key ล้มเหลว",
	NAME_REQUIRED: "จำเป็นต้องระบุชื่อ API Key",
	ORGANIZATION_ID_REQUIRED: "จำเป็นต้องระบุรหัสองค์กรสำหรับ API Key ขององค์กร",
	USER_NOT_MEMBER_OF_ORGANIZATION: "คุณไม่ได้เป็นสมาชิกขององค์กรที่เป็นเจ้าของ API Key นี้",
	INSUFFICIENT_API_KEY_PERMISSIONS: "คุณไม่มีสิทธิ์ในการดำเนินการนี้บน API Key ขององค์กร",
	NO_DEFAULT_API_KEY_CONFIGURATION_FOUND: "ไม่พบการตั้งค่าเริ่มต้นของ API Key",
	ORGANIZATION_PLUGIN_REQUIRED:
		"จำเป็นต้องใช้ปลั๊กอินองค์กรสำหรับ API Key ขององค์กร โปรดติดตั้งและกำหนดค่าปลั๊กอินองค์กร",
};
