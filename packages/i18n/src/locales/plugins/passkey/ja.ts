import type { PASSKEY_ERROR_CODES } from "@better-auth/passkey";
import type { LocalizedTranslations } from "../../../types";

export const jaPasskey: LocalizedTranslations<typeof PASSKEY_ERROR_CODES> = {
	CHALLENGE_NOT_FOUND: "チャレンジが見つかりません",
	YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
		"このパスキーの登録 is not allowed",
	FAILED_TO_VERIFY_REGISTRATION: "登録の検証に失敗しました",
	PASSKEY_NOT_FOUND: "パスキーが見つかりません",
	AUTHENTICATION_FAILED: "認証に失敗しました",
	UNABLE_TO_CREATE_SESSION: "セッションを作成できません",
	FAILED_TO_UPDATE_PASSKEY: "パスキーの更新に失敗しました",
	PREVIOUSLY_REGISTERED: "既に登録されています",
	REGISTRATION_CANCELLED: "登録がキャンセルされました",
	AUTH_CANCELLED: "認証がキャンセルされました",
	UNKNOWN_ERROR: "不明なエラーが発生しました",
	SESSION_REQUIRED: "パスキーの登録には認証されたセッションが必要です",
	RESOLVE_USER_REQUIRED:
		"requireSessionがfalseの場合、パスキーの登録には認証されたセッションまたはresolveUserコールバックのいずれかが必要です",
	RESOLVED_USER_INVALID: "解決されたユーザーが無効です",
};
