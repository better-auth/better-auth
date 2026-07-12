import type { OAUTH_POPUP_ERROR_CODES } from "better-auth/plugins";
import type { LocalizedTranslations } from "../../../types";

export const thOauthPopup: LocalizedTranslations<
	typeof OAUTH_POPUP_ERROR_CODES
> = {
	POPUP_SIGN_IN_FAILED: "การเข้าสู่ระบบผ่านป๊อปอัปล้มเหลว",
	POPUP_BLOCKED: "ป๊อปอัปการเข้าสู่ระบบถูกบล็อกโดยเบราว์เซอร์",
	POPUP_CLOSED: "ป๊อปอัปการเข้าสู่ระบบถูกปิดก่อนดำเนินการเสร็จสิ้น",
	POPUP_TIMEOUT: "ป๊อปอัปการเข้าสู่ระบบหมดเวลา",
};
