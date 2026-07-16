import type { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins/two-factor";
import type { LocalizedTranslations } from "../../../types";

export const ptTwoFactor: LocalizedTranslations<typeof TWO_FACTOR_ERROR_CODES> =
	{
		OTP_NOT_ENABLED: "OTP não habilitado",
		OTP_NOT_CONFIGURED: "OTP não configurado",
		OTP_HAS_EXPIRED: "OTP expirou",
		TOTP_NOT_ENABLED: "TOTP não habilitado",
		TOTP_NOT_CONFIGURED: "TOTP não configurado",
		TWO_FACTOR_NOT_ENABLED:
			"A autenticação de dois fatores não está habilitada",
		BACKUP_CODES_NOT_ENABLED: "Os códigos de backup não estão habilitados",
		INVALID_BACKUP_CODE: "O código de backup é inválido ou já foi utilizado.",
		INVALID_CODE:
			"O código que você inseriu é inválido. Por favor, verifique e tente novamente.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"Tentativas demais. Por favor, solicite um novo código.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"Muitas tentativas de verificação falharam. Sua conta está temporariamente bloqueada. Por favor, tente novamente mais tarde.",
		INVALID_TWO_FACTOR_COOKIE: "Cookie de dois fatores inválido",
	};
