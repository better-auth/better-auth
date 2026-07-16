import type { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins/two-factor";
import type { LocalizedTranslations } from "../../../types";

export const deTwoFactor: LocalizedTranslations<typeof TWO_FACTOR_ERROR_CODES> =
	{
		OTP_NOT_ENABLED: "OTP nicht aktiviert",
		OTP_NOT_CONFIGURED: "OTP nicht konfiguriert",
		OTP_HAS_EXPIRED: "OTP ist abgelaufen",
		TOTP_NOT_ENABLED: "TOTP nicht aktiviert",
		TOTP_NOT_CONFIGURED: "TOTP nicht konfiguriert",
		TWO_FACTOR_NOT_ENABLED: "Zwei-Faktor-Authentifizierung ist nicht aktiviert",
		BACKUP_CODES_NOT_ENABLED: "Backup-Codes sind nicht aktiviert",
		INVALID_BACKUP_CODE:
			"Der Backup-Code ist ungültig oder wurde bereits verwendet.",
		INVALID_CODE:
			"Der eingegebene Code ist ungültig. Bitte überprüfen Sie ihn und versuchen Sie es erneut.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"Zu viele Versuche. Bitte fordern Sie einen neuen Code an.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"Zu viele fehlgeschlagene Verifizierungsversuche. Ihr Konto ist vorübergehend gesperrt. Bitte versuchen Sie es später noch einmal.",
		INVALID_TWO_FACTOR_COOKIE: "Ungültiges Zwei-Faktor-Cookie",
	};
