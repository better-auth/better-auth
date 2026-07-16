import type { OAUTH_POPUP_ERROR_CODES } from "better-auth/plugins";
import type { LocalizedTranslations } from "../../../types";

export const arOauthPopup: LocalizedTranslations<
	typeof OAUTH_POPUP_ERROR_CODES
> = {
	POPUP_SIGN_IN_FAILED: "فشل تسجيل الدخول عبر النافذة المنبثقة",
	POPUP_BLOCKED: "تم حجب النافذة المنبثقة لتسجيل الدخول من قبل المتصفح",
	POPUP_CLOSED: "تم إغلاق النافذة المنبثقة لتسجيل الدخول قبل الاكتمال",
	POPUP_TIMEOUT: "انتهت مهلة النافذة المنبثقة لتسجيل الدخول",
};
