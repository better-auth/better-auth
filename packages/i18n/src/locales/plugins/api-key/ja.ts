import type { API_KEY_ERROR_CODES } from "@better-auth/api-key";
import type { LocalizedTranslations } from "../../../types";

export const jaApiKey: LocalizedTranslations<typeof API_KEY_ERROR_CODES> = {
	INVALID_METADATA_TYPE:
		"メタデータはオブジェクトまたは未定義である必要があります",
	REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
		"refillIntervalが提供される場合、refillAmountが必要です",
	REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
		"refillAmountが提供される場合、refillIntervalが必要です",
	USER_BANNED: "ユーザーは禁止されています",
	UNAUTHORIZED_SESSION: "未認可または無効なセッション",
	KEY_NOT_FOUND: "APIキーが見つかりません",
	KEY_DISABLED: "APIキーは無効化されています",
	KEY_EXPIRED: "APIキーは期限切れです",
	USAGE_EXCEEDED: "APIキーの使用制限に達しました",
	KEY_NOT_RECOVERABLE: "APIキーは復元できません",
	EXPIRES_IN_IS_TOO_SMALL:
		"expiresInの値が事前に定義された最小値よりも小さいです。",
	EXPIRES_IN_IS_TOO_LARGE:
		"expiresInの値が事前に定義された最大値よりも大きいです。",
	INVALID_REMAINING: "残りの数は大きすぎるか小さすぎます。",
	INVALID_PREFIX_LENGTH: "プレフィックスの長さは長すぎるか短すぎます。",
	INVALID_NAME_LENGTH: "名前の長さは長すぎるか短すぎます。",
	METADATA_DISABLED: "メタデータは無効になっています。",
	RATE_LIMIT_EXCEEDED: "レート制限を超過しました。",
	NO_VALUES_TO_UPDATE: "更新する値がありません。",
	KEY_DISABLED_EXPIRATION: "カスタムキーの有効期限値は無効になっています。",
	INVALID_API_KEY: "無効なAPIキーです。",
	INVALID_USER_ID_FROM_API_KEY: "APIキーのユーザーIDが無効です。",
	INVALID_REFERENCE_ID_FROM_API_KEY: "APIキーのリファレンスIDが無効です。",
	INVALID_API_KEY_GETTER_RETURN_TYPE:
		"APIキーゲッターが無効なキータイプを返しました。文字列が期待されます。",
	SERVER_ONLY_PROPERTY:
		"設定しようとしているプロパティは、サーバー認証インスタンスからのみ設定できます。",
	FAILED_TO_UPDATE_API_KEY: "APIキーの更新に失敗しました",
	NAME_REQUIRED: "APIキーの名前が必要です。",
	ORGANIZATION_ID_REQUIRED: "組織が所有するAPIキーには組織IDが必要です。",
	USER_NOT_MEMBER_OF_ORGANIZATION:
		"このAPIキーを所有する組織のメンバーではありません。",
	INSUFFICIENT_API_KEY_PERMISSIONS:
		"組織のAPIキーに対してこのアクションを実行する権限がありません。",
	NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
		"デフォルトのAPIキー構成が見つかりません。",
	ORGANIZATION_PLUGIN_REQUIRED:
		"組織が所有するAPIキーには組織プラグインが必要です。組織プラグインをインストールして構成してください。",
};
