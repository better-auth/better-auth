import type { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins/two-factor";
import type { LocalizedTranslations } from "../../../types";

export const ukTwoFactor: LocalizedTranslations<typeof TWO_FACTOR_ERROR_CODES> =
	{
		OTP_NOT_ENABLED: "OTP не увімкнено",
		OTP_NOT_CONFIGURED: "OTP не налаштовано",
		OTP_HAS_EXPIRED: "OTP закінчився",
		TOTP_NOT_ENABLED: "TOTP не увімкнено",
		TOTP_NOT_CONFIGURED: "TOTP не налаштовано",
		TWO_FACTOR_NOT_ENABLED: "Двофакторна аутентифікація не увімкнена",
		BACKUP_CODES_NOT_ENABLED: "Резервні коди не увімкнено",
		INVALID_BACKUP_CODE: "Резервний код недійсний або вже використаний.",
		INVALID_CODE: "Введений код недійсний. Перевірте і спробуйте ще раз.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"Забагато спроб. Будь ласка, запросіть новий код.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"Забагато невдалих спроб верифікації. Ваш обліковий запис тимчасово заблоковано. Спробуйте пізніше.",
		INVALID_TWO_FACTOR_COOKIE: "Недійсний cookie двофакторної аутентифікації",
	};
