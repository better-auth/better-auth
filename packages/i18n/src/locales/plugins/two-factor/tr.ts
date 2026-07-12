import type { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins/two-factor";
import type { LocalizedTranslations } from "../../../types";

export const trTwoFactor: LocalizedTranslations<typeof TWO_FACTOR_ERROR_CODES> =
	{
		OTP_NOT_ENABLED: "OTP etkinleştirilmedi",
		OTP_NOT_CONFIGURED: "OTP yapılandırılmadı",
		OTP_HAS_EXPIRED: "OTP süresi doldu",
		TOTP_NOT_ENABLED: "TOTP etkinleştirilmedi",
		TOTP_NOT_CONFIGURED: "TOTP yapılandırılmadı",
		TWO_FACTOR_NOT_ENABLED: "İki faktörlü kimlik doğrulama etkinleştirilmedi",
		BACKUP_CODES_NOT_ENABLED: "Yedek kodlar etkinleştirilmedi",
		INVALID_BACKUP_CODE: "Yedek kod geçersiz veya zaten kullanılmış.",
		INVALID_CODE:
			"Girdiğiniz kod geçersiz. Lütfen kontrol edip tekrar deneyin.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"Çok fazla deneme. Lütfen yeni bir kod talep edin.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"Çok fazla başarısız doğrulama denemesi. Hesabınız geçici olarak kilitlendi. Lütfen daha sonra tekrar deneyin.",
		INVALID_TWO_FACTOR_COOKIE: "Geçersiz iki faktörlü kimlik doğrulama çerezi",
	};
