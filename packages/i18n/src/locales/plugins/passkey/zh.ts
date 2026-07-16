import type { PASSKEY_ERROR_CODES } from "@better-auth/passkey";
import type { LocalizedTranslations } from "../../../types";

export const zhPasskey: LocalizedTranslations<typeof PASSKEY_ERROR_CODES> = {
	CHALLENGE_NOT_FOUND: "未找到挑战",
	YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: "您无权注册此通行密钥",
	FAILED_TO_VERIFY_REGISTRATION: "无法验证注册",
	PASSKEY_NOT_FOUND: "未找到通行密钥",
	AUTHENTICATION_FAILED: "身份验证失败",
	UNABLE_TO_CREATE_SESSION: "无法创建会话",
	FAILED_TO_UPDATE_PASSKEY: "更新通行密钥失败",
	PREVIOUSLY_REGISTERED: "此前已注册",
	REGISTRATION_CANCELLED: "注册已取消",
	AUTH_CANCELLED: "验证已取消",
	UNKNOWN_ERROR: "未知错误",
	SESSION_REQUIRED: "注册通行密钥需要已登录的会话",
	RESOLVE_USER_REQUIRED:
		"当 requireSession 为 false 时，注册通行密钥需要已登录 the session or resolveUser callback",
	RESOLVED_USER_INVALID: "解析的用户无效",
};
