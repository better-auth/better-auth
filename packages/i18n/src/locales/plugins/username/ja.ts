import type { USERNAME_ERROR_CODES } from "better-auth/plugins/username";
import type { LocalizedTranslations } from "../../../types";

export const jaUsername: LocalizedTranslations<typeof USERNAME_ERROR_CODES> = {
	INVALID_USERNAME_OR_PASSWORD: "ユーザー名またはパスワードが無効です",
	EMAIL_NOT_VERIFIED: "メールアドレスが未確認です",
	UNEXPECTED_ERROR: "予期しないエラーが発生しました",
	USERNAME_IS_ALREADY_TAKEN:
		"このユーザー名はすでに使用されています。別の名前をお試しください。",
	USERNAME_TOO_SHORT: "ユーザー名が短すぎます",
	USERNAME_TOO_LONG: "ユーザー名が長すぎます",
	INVALID_USERNAME: "ユーザー名が無効です",
	INVALID_DISPLAY_USERNAME: "表示名が無効です",
	USERNAME_IS_IMMUTABLE: "ユーザー名は変更できません",
};
