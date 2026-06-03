import type { TranslationDictionary } from "../types";

/**
 * Japanese translations
 */
export const ja: TranslationDictionary = {
	USER_NOT_FOUND: "ユーザーが見つかりません",
	FAILED_TO_CREATE_USER: "ユーザーの作成に失敗しました",
	FAILED_TO_CREATE_SESSION: "セッションの作成に失敗しました",
	FAILED_TO_UPDATE_USER: "ユーザーの更新に失敗しました",
	FAILED_TO_GET_SESSION: "セッションの取得に失敗しました",
	INVALID_PASSWORD: "パスワードが無効です",
	INVALID_EMAIL: "メールアドレスが無効です",
	INVALID_EMAIL_OR_PASSWORD: "メールアドレスまたはパスワードが無効です",
	INVALID_USER: "ユーザーが無効です",
	SOCIAL_ACCOUNT_ALREADY_LINKED: "ソーシャルアカウントはすでに連携されています",
	PROVIDER_NOT_FOUND: "プロバイダーが見つかりません",
	INVALID_TOKEN: "トークンが無効です",
	TOKEN_EXPIRED: "トークンの有効期限が切れています",
	FAILED_TO_GET_USER_INFO: "ユーザー情報の取得に失敗しました",
	USER_EMAIL_NOT_FOUND: "ユーザーのメールアドレスが見つかりません",
	EMAIL_NOT_VERIFIED: "メールアドレスが確認されていません",
	PASSWORD_TOO_SHORT: "パスワードが短すぎます",
	PASSWORD_TOO_LONG: "パスワードが長すぎます",
	USER_ALREADY_EXISTS: "ユーザーはすでに存在します",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"ユーザーはすでに存在します。別のメールアドレスをご使用ください。",
	EMAIL_CAN_NOT_BE_UPDATED: "メールアドレスは更新できません",
	CREDENTIAL_ACCOUNT_NOT_FOUND: "認証アカウントが見つかりません",
	SESSION_EXPIRED:
		"セッションの有効期限が切れています。このアクションを実行するには再認証してください。",
	FAILED_TO_UNLINK_LAST_ACCOUNT:
		"最後のアカウントの連携を解除することはできません",
	ACCOUNT_NOT_FOUND: "アカウントが見つかりません",
	USER_ALREADY_HAS_PASSWORD:
		"ユーザーにはすでにパスワードが設定されています。アカウントを削除するにはパスワードを入力してください。",
	VERIFICATION_EMAIL_NOT_ENABLED: "確認メールが有効化されていません",
	EMAIL_ALREADY_VERIFIED: "メールアドレスはすでに確認済みです",
	EMAIL_MISMATCH: "メールアドレスが一致しません",
	SESSION_NOT_FRESH: "セッションが最新ではありません",
	LINKED_ACCOUNT_ALREADY_EXISTS: "連携アカウントはすでに存在します",
	VALIDATION_ERROR: "バリデーションエラー",
	MISSING_FIELD: "このフィールドは必須です",
	PASSWORD_ALREADY_SET: "ユーザーにはすでにパスワードが設定されています",
};
