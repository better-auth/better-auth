import type { PHONE_NUMBER_ERROR_CODES } from "better-auth/plugins/phone-number";
import type { LocalizedTranslations } from "../../../types";

export const jaPhoneNumber: LocalizedTranslations<
	typeof PHONE_NUMBER_ERROR_CODES
> = {
	INVALID_PHONE_NUMBER: "電話番号が無効です",
	PHONE_NUMBER_EXIST: "この電話番号はすでに存在します",
	PHONE_NUMBER_NOT_EXIST: "この電話番号は登録されていません",
	INVALID_PHONE_NUMBER_OR_PASSWORD: "電話番号またはパスワードが無効です",
	UNEXPECTED_ERROR: "予期しないエラーが発生しました",
	OTP_NOT_FOUND: "OTPが見つかりません",
	OTP_EXPIRED: "OTPの有効期限が切れました",
	INVALID_OTP: "無効なOTPです",
	PHONE_NUMBER_NOT_VERIFIED: "電話番号が確認されていません",
	PHONE_NUMBER_CANNOT_BE_UPDATED: "電話番号は更新できません",
	SEND_OTP_NOT_IMPLEMENTED: "sendOTPが実装されていません",
	TOO_MANY_ATTEMPTS:
		"試行回数が多すぎます。しばらく後でもう一度お試しください。",
};
