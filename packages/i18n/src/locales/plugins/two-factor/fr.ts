import type { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins/two-factor";
import type { LocalizedTranslations } from "../../../types";

export const frTwoFactor: LocalizedTranslations<typeof TWO_FACTOR_ERROR_CODES> =
	{
		OTP_NOT_ENABLED: "OTP non activé",
		OTP_NOT_CONFIGURED: "OTP non configuré",
		OTP_HAS_EXPIRED: "L'OTP a expiré",
		TOTP_NOT_ENABLED: "TOTP non activé",
		TOTP_NOT_CONFIGURED: "TOTP non configuré",
		TWO_FACTOR_NOT_ENABLED: "Le double facteur n'est pas activé",
		BACKUP_CODES_NOT_ENABLED: "Les codes de secours ne sont pas activés",
		INVALID_BACKUP_CODE:
			"Le code de secours est invalide ou a déjà été utilisé.",
		INVALID_CODE: "Le code saisi est invalide. Vérifiez et réessayez.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"Trop de tentatives. Veuillez demander un nouveau code.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"Trop de tentatives de vérification infructueuses. Votre compte est temporairement verrouillé. Veuillez réessayer plus tard.",
		INVALID_TWO_FACTOR_COOKIE: "Cookie double facteur invalide",
	};
