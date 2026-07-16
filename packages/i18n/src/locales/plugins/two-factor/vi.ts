import type { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins/two-factor";
import type { LocalizedTranslations } from "../../../types";

export const viTwoFactor: LocalizedTranslations<typeof TWO_FACTOR_ERROR_CODES> =
	{
		OTP_NOT_ENABLED: "OTP chưa được bật",
		OTP_NOT_CONFIGURED: "OTP chưa được cấu hình",
		OTP_HAS_EXPIRED: "OTP đã hết hạn",
		TOTP_NOT_ENABLED: "TOTP chưa được bật",
		TOTP_NOT_CONFIGURED: "TOTP chưa được cấu hình",
		TWO_FACTOR_NOT_ENABLED: "Xác thực hai yếu tố chưa được bật",
		BACKUP_CODES_NOT_ENABLED: "Mã dự phòng chưa được bật",
		INVALID_BACKUP_CODE: "Mã dự phòng không hợp lệ hoặc đã được sử dụng.",
		INVALID_CODE: "Mã bạn nhập không hợp lệ. Vui lòng kiểm tra và thử lại.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"Quá nhiều lần thử. Vui lòng yêu cầu mã mới.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"Quá nhiều lần xác thực thất bại. Tài khoản của bạn tạm thời bị khóa. Vui lòng thử lại sau.",
		INVALID_TWO_FACTOR_COOKIE: "Cookie xác thực hai yếu tố không hợp lệ",
	};
