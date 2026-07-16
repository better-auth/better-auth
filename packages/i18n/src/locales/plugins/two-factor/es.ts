import type { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins/two-factor";
import type { LocalizedTranslations } from "../../../types";

export const esTwoFactor: LocalizedTranslations<typeof TWO_FACTOR_ERROR_CODES> =
	{
		OTP_NOT_ENABLED: "OTP no habilitado",
		OTP_NOT_CONFIGURED: "OTP no configurado",
		OTP_HAS_EXPIRED: "OTP ha expirado",
		TOTP_NOT_ENABLED: "TOTP no habilitado",
		TOTP_NOT_CONFIGURED: "TOTP no configurado",
		TWO_FACTOR_NOT_ENABLED:
			"La autenticación de dos factores no está habilitada",
		BACKUP_CODES_NOT_ENABLED: "Los códigos de respaldo no están habilitados",
		INVALID_BACKUP_CODE:
			"El código de respaldo es inválido o ya fue utilizado.",
		INVALID_CODE:
			"El código que ingresaste es inválido. Por favor, verifica e intenta de nuevo.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"Demasiados intentos. Por favor, solicita un nuevo código.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"Demasiados intentos fallidos. Tu cuenta está temporalmente bloqueada. Por favor, intenta más tarde.",
		INVALID_TWO_FACTOR_COOKIE: "Cookie de doble factor inválida",
	};
