import type { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins/two-factor";
import type { LocalizedTranslations } from "../../../types";

export const ruTwoFactor: LocalizedTranslations<typeof TWO_FACTOR_ERROR_CODES> =
	{
		OTP_NOT_ENABLED: "OTP не включён",
		OTP_NOT_CONFIGURED: "OTP не настроен",
		OTP_HAS_EXPIRED: "OTP истёк",
		TOTP_NOT_ENABLED: "TOTP не включён",
		TOTP_NOT_CONFIGURED: "TOTP не настроен",
		TWO_FACTOR_NOT_ENABLED: "Двухфакторная аутентификация не включена",
		BACKUP_CODES_NOT_ENABLED: "Резервные коды не включены",
		INVALID_BACKUP_CODE: "Резервный код недействителен или уже использован.",
		INVALID_CODE: "Введённый код недействителен. Проверьте и попробуйте снова.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"Слишком много попыток. Пожалуйста, запросите новый код.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"Слишком много неудачных попыток верификации. Ваша учётная запись временно заблокирована. Попробуйте позже.",
		INVALID_TWO_FACTOR_COOKIE:
			"Недействительный cookie двухфакторной аутентификации",
	};
