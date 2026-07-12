import type { ANONYMOUS_ERROR_CODES } from "better-auth/plugins/anonymous";
import type { LocalizedTranslations } from "../../../types";

export const thAnonymous: LocalizedTranslations<typeof ANONYMOUS_ERROR_CODES> =
	{
		INVALID_EMAIL_FORMAT: "อีเมลไม่ได้สร้างขึ้นในรูปแบบที่ถูกต้อง",
		FAILED_TO_CREATE_USER: "สร้างผู้ใช้ไม่สำเร็จ",
		COULD_NOT_CREATE_SESSION: "ไม่สามารถสร้างเซสชันได้",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"ผู้ใช้นิรนามไม่สามารถลงชื่อเข้าใช้อย่างนิรนามได้อีกครั้ง",
		FAILED_TO_DELETE_ANONYMOUS_USER: "ลบผู้ใช้นิรนามไม่สำเร็จ",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS: "ลบเซสชันของผู้ใช้นิรนามไม่สำเร็จ",
		USER_IS_NOT_ANONYMOUS: "ผู้ใช้ไม่ได้เป็นนิรนาม",
		DELETE_ANONYMOUS_USER_DISABLED: "การลบผู้ใช้นิรนามถูกปิดใช้งาน",
	};
