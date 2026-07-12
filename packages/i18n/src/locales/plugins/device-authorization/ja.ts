import type { DEVICE_AUTHORIZATION_ERROR_CODES } from "better-auth/plugins/device-authorization";
import type { LocalizedTranslations } from "../../../types";

export const jaDeviceAuthorization: LocalizedTranslations<
	typeof DEVICE_AUTHORIZATION_ERROR_CODES
> = {
	INVALID_DEVICE_CODE: "無効なデバイスコード",
	EXPIRED_DEVICE_CODE: "デバイスコードの期限が切れました",
	EXPIRED_USER_CODE: "ユーザーコードの期限が切れました",
	AUTHORIZATION_PENDING: "承認待ち",
	ACCESS_DENIED: "アクセスが拒否されました",
	INVALID_USER_CODE: "無効なユーザーコード",
	DEVICE_CODE_ALREADY_PROCESSED: "デバイスコードはすでに処理されています",
	DEVICE_CODE_NOT_CLAIMED:
		"デバイスコードが検証セッションによって要求されていません。承認または拒否する前に、サインインした状態で `user_code` を指定して `GET /device` を呼び出してください",
	POLLING_TOO_FREQUENTLY: "ポーリングの頻度が高すぎます",
	USER_NOT_FOUND: "ユーザーが見つかりません",
	FAILED_TO_CREATE_SESSION: "セッションの作成に失敗しました",
	INVALID_DEVICE_CODE_STATUS: "無効なデバイスコードステータス",
	AUTHENTICATION_REQUIRED: "認証が必要です",
};
