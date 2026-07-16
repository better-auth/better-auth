import type { USERNAME_ERROR_CODES } from "better-auth/plugins/username";
import type { LocalizedTranslations } from "../../../types";

export const zhUsername: LocalizedTranslations<typeof USERNAME_ERROR_CODES> = {
	INVALID_USERNAME_OR_PASSWORD: "用户名或密码无效",
	EMAIL_NOT_VERIFIED: "电子邮箱未验证",
	UNEXPECTED_ERROR: "发生意外错误",
	USERNAME_IS_ALREADY_TAKEN: "用户名已被占用，请尝试其他用户名。",
	USERNAME_TOO_SHORT: "用户名太短",
	USERNAME_TOO_LONG: "用户名太长",
	INVALID_USERNAME: "用户名无效",
	INVALID_DISPLAY_USERNAME: "显示名称无效",
	USERNAME_IS_IMMUTABLE: "用户名无法更新",
};
