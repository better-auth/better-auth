import type { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins/two-factor";
import type { LocalizedTranslations } from "../../../types";

export const itTwoFactor: LocalizedTranslations<typeof TWO_FACTOR_ERROR_CODES> =
	{
		OTP_NOT_ENABLED: "OTP non abilitato",
		OTP_NOT_CONFIGURED: "OTP non configurato",
		OTP_HAS_EXPIRED: "OTP scaduto",
		TOTP_NOT_ENABLED: "TOTP non abilitato",
		TOTP_NOT_CONFIGURED: "TOTP non configurato",
		TWO_FACTOR_NOT_ENABLED: "L'autenticazione a due fattori non è abilitata",
		BACKUP_CODES_NOT_ENABLED: "I codici di backup non sono abilitati",
		INVALID_BACKUP_CODE:
			"Il codice di backup non è valido o è già stato utilizzato.",
		INVALID_CODE: "Il codice inserito non è valido. Controlla e riprova.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"Troppi tentativi. Richiedi un nuovo codice.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"Troppi tentativi di verifica falliti. Il tuo account è temporaneamente bloccato. Riprova più tardi.",
		INVALID_TWO_FACTOR_COOKIE: "Cookie a due fattori non valido",
	};
