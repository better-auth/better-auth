import type { ADMIN_ERROR_CODES } from "better-auth/plugins/admin";
import type { LocalizedTranslations } from "../../../types";

export const jaAdmin: LocalizedTranslations<typeof ADMIN_ERROR_CODES> = {
	FAILED_TO_CREATE_USER: "ユーザーの作成に失敗しました",
	USER_ALREADY_EXISTS: "ユーザーはすでに存在します。",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"ユーザーはすでに存在します。別のメールアドレスを使用してください。",
	YOU_CANNOT_BAN_YOURSELF: "自分自身を禁止することはできません",
	YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
		"ユーザーの役割を変更することは許可されていません",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS:
		"ユーザーを作成することは許可されていません",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS:
		"ユーザーを一覧表示することは許可されていません",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
		"ユーザーのセッションを一覧表示することは許可されていません",
	YOU_ARE_NOT_ALLOWED_TO_BAN_USERS:
		"ユーザーを禁止することは許可されていません",
	YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
		"ユーザーになりすますことは許可されていません",
	YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
		"ユーザーのセッションを破棄することは許可されていません",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS:
		"ユーザーを削除することは許可されていません",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
		"ユーザーのパスワードを設定することは許可されていません",
	BANNED_USER: "このアプリケーションから禁止されました",
	YOU_ARE_NOT_ALLOWED_TO_GET_USER: "ユーザーの取得は許可されていません",
	NO_DATA_TO_UPDATE: "更新するデータがありません",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
		"ユーザーを更新することは許可されていません",
	YOU_CANNOT_REMOVE_YOURSELF: "自分自身を削除することはできません",
	YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
		"存在しない役割の値を設定することは許可されていません",
	YOU_CANNOT_IMPERSONATE_ADMINS: "管理者のなりすましはできません",
	INVALID_ROLE_TYPE: "無効な役割タイプ",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
		"ユーザーのメールアドレスを更新することは許可されていません",
	PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
		"ユーザーの更新を通じてパスワードを更新することはできません。代わりに set-user-password エンドポイントを使用してください",
};
