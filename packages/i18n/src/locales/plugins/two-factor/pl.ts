import type { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins/two-factor";
import type { LocalizedTranslations } from "../../../types";

export const plTwoFactor: LocalizedTranslations<typeof TWO_FACTOR_ERROR_CODES> =
	{
		OTP_NOT_ENABLED: "OTP nie jest włączony",
		OTP_NOT_CONFIGURED: "OTP nie jest skonfigurowany",
		OTP_HAS_EXPIRED: "OTP wygasł",
		TOTP_NOT_ENABLED: "TOTP nie jest włączony",
		TOTP_NOT_CONFIGURED: "TOTP nie jest skonfigurowany",
		TWO_FACTOR_NOT_ENABLED: "Uwierzytelnianie dwuskładnikowe nie jest włączone",
		BACKUP_CODES_NOT_ENABLED: "Kody zapasowe nie są włączone",
		INVALID_BACKUP_CODE:
			"Kod zapasowy jest nieprawidłowy lub już został użyty.",
		INVALID_CODE:
			"Wprowadzony kod jest nieprawidłowy. Sprawdź i spróbuj ponownie.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "Zbyt wiele prób. Poproś o nowy kod.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"Zbyt wiele nieudanych prób weryfikacji. Twoje konto jest tymczasowo zablokowane. Spróbuj ponownie później.",
		INVALID_TWO_FACTOR_COOKIE:
			"Nieprawidłowy plik cookie uwierzytelniania dwuskładnikowego",
	};
