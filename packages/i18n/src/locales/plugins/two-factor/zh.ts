import type { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins/two-factor";
import type { LocalizedTranslations } from "../../../types";

export const zhTwoFactor: LocalizedTranslations<typeof TWO_FACTOR_ERROR_CODES> =
	{
		OTP_NOT_ENABLED: "OTP 未启用",
		OTP_NOT_CONFIGURED: "OTP 未配置",
		OTP_HAS_EXPIRED: "OTP 已过期",
		TOTP_NOT_ENABLED: "TOTP 未启用",
		TOTP_NOT_CONFIGURED: "TOTP 未配置",
		TWO_FACTOR_NOT_ENABLED: "双重验证未启用",
		BACKUP_CODES_NOT_ENABLED: "备用代码未启用",
		INVALID_BACKUP_CODE: "备用代码无效或已使用。",
		INVALID_CODE: "您输入的验证码无效，请检查后重试。",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "尝试次数过多，请重新获取验证码。",
		ACCOUNT_TEMPORARILY_LOCKED:
			"验证失败次数过多，您的账户已被临时锁定，请稍后再试。",
		INVALID_TWO_FACTOR_COOKIE: "双重验证 Cookie 无效",
	};
