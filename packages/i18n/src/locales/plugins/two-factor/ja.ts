import type { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins/two-factor";
import type { LocalizedTranslations } from "../../../types";

export const jaTwoFactor: LocalizedTranslations<typeof TWO_FACTOR_ERROR_CODES> =
	{
		OTP_NOT_ENABLED: "OTPが有効化されていません",
		OTP_NOT_CONFIGURED: "OTPが設定されていません",
		OTP_HAS_EXPIRED: "OTPの有効期限が切れました",
		TOTP_NOT_ENABLED: "TOTPが有効化されていません",
		TOTP_NOT_CONFIGURED: "TOTPが設定されていません",
		TWO_FACTOR_NOT_ENABLED: "二要素認証が有効化されていません",
		BACKUP_CODES_NOT_ENABLED: "バックアップコードが有効化されていません",
		INVALID_BACKUP_CODE: "バックアップコードが無効か、すでに使用されています。",
		INVALID_CODE: "入力したコードが無効です。確認して再試行してください。",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"試行回数が多すぎます。新しいコードをリクエストしてください。",
		ACCOUNT_TEMPORARILY_LOCKED:
			"認証失敗が多すぎます。アカウントは一時的にロックされています。後でもう一度お試しください。",
		INVALID_TWO_FACTOR_COOKIE: "二要素認証Cookieが無効です",
	};
