import type { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins/two-factor";
import type { LocalizedTranslations } from "../../../types";

export const svTwoFactor: LocalizedTranslations<typeof TWO_FACTOR_ERROR_CODES> =
	{
		OTP_NOT_ENABLED: "OTP är inte aktiverat",
		OTP_NOT_CONFIGURED: "OTP är inte konfigurerat",
		OTP_HAS_EXPIRED: "OTP har gått ut",
		TOTP_NOT_ENABLED: "TOTP är inte aktiverat",
		TOTP_NOT_CONFIGURED: "TOTP är inte konfigurerat",
		TWO_FACTOR_NOT_ENABLED: "Tvåfaktorsautentisering är inte aktiverad",
		BACKUP_CODES_NOT_ENABLED: "Reservkoder är inte aktiverade",
		INVALID_BACKUP_CODE: "Reservkoden är ogiltig eller har redan använts.",
		INVALID_CODE: "Koden du angav är ogiltig. Kontrollera och försök igen.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "För många försök. Begär en ny kod.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"För många misslyckade verifieringsförsök. Ditt konto är tillfälligt låst. Försök igen senare.",
		INVALID_TWO_FACTOR_COOKIE: "Ogiltig tvåfaktors-cookie",
	};
