import type { OAUTH_POPUP_ERROR_CODES } from "better-auth/plugins";
import type { LocalizedTranslations } from "../../../types";

export const zhOauthPopup: LocalizedTranslations<
	typeof OAUTH_POPUP_ERROR_CODES
> = {
	POPUP_SIGN_IN_FAILED: "弹出窗口登录失败",
	POPUP_BLOCKED: "登录弹出窗口被浏览器拦截",
	POPUP_CLOSED: "登录弹出窗口在完成前被关闭",
	POPUP_TIMEOUT: "登录弹出窗口已超时",
};
