import type { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins/two-factor";
import type { LocalizedTranslations } from "../../../types";

export const nlTwoFactor: LocalizedTranslations<typeof TWO_FACTOR_ERROR_CODES> =
	{
		OTP_NOT_ENABLED: "OTP niet ingeschakeld",
		OTP_NOT_CONFIGURED: "OTP niet geconfigureerd",
		OTP_HAS_EXPIRED: "OTP is verlopen",
		TOTP_NOT_ENABLED: "TOTP niet ingeschakeld",
		TOTP_NOT_CONFIGURED: "TOTP niet geconfigureerd",
		TWO_FACTOR_NOT_ENABLED: "Tweestapsverificatie is niet ingeschakeld",
		BACKUP_CODES_NOT_ENABLED: "Back-upcodes zijn niet ingeschakeld",
		INVALID_BACKUP_CODE: "De back-upcode is ongeldig of al gebruikt.",
		INVALID_CODE:
			"De ingevoerde code is ongeldig. Controleer het en probeer opnieuw.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"Te veel pogingen. Vraag een nieuwe code aan.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"Te veel mislukte verificatiepogingen. Uw account is tijdelijk vergrendeld. Probeer het later opnieuw.",
		INVALID_TWO_FACTOR_COOKIE: "Ongeldige tweestapsverificatiecookie",
	};
