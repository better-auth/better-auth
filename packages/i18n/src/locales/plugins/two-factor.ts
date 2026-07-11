import type { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins/two-factor";
import type { PluginErrorTranslations } from "../../types";

const enVal = {
	OTP_NOT_ENABLED: "OTP not enabled",
	OTP_NOT_CONFIGURED: "OTP not configured",
	OTP_HAS_EXPIRED: "OTP has expired",
	TOTP_NOT_ENABLED: "TOTP not enabled",
	TOTP_NOT_CONFIGURED: "TOTP not configured",
	TWO_FACTOR_NOT_ENABLED: "Two factor isn't enabled",
	BACKUP_CODES_NOT_ENABLED: "Backup codes aren't enabled",
	INVALID_BACKUP_CODE: "The backup code is invalid or has already been used.",
	INVALID_CODE: "The code you entered is invalid. Please check and try again.",
	TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
		"Too many attempts. Please request a new code.",
	ACCOUNT_TEMPORARILY_LOCKED:
		"Too many failed verification attempts. Your account is temporarily locked. Please try again later.",
	INVALID_TWO_FACTOR_COOKIE: "Invalid two factor cookie",
};

export const twoFactorTranslations: PluginErrorTranslations<
	typeof TWO_FACTOR_ERROR_CODES
> = {
	en: enVal,
	fr: {
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
	},
	ar: {
		OTP_NOT_ENABLED: "رمز التحقق لمرة واحدة غير مفعل",
		OTP_NOT_CONFIGURED: "لم يتم تكوين رمز التحقق لمرة واحدة",
		OTP_HAS_EXPIRED: "انتهت صلاحية رمز التحقق لمرة واحدة",
		TOTP_NOT_ENABLED: "رمز التحقق TOTP غير مفعل",
		TOTP_NOT_CONFIGURED: "لم يتم تكوين رمز التحقق TOTP",
		TWO_FACTOR_NOT_ENABLED: "التحقق الثنائي غير مفعل",
		BACKUP_CODES_NOT_ENABLED: "رموز الاحتياط غير مفعّلة",
		INVALID_BACKUP_CODE: "الرمز الاحتياطي غير صالح أو تم استخدامه.",
		INVALID_CODE: "الرمز غير صحيح. تحقق وحاول مرة أخرى.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "محاولات كثيرة جداً. يرجى طلب رمز جديد.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"تم قفل هذا الحساب مؤقتاً. يرجى المحاولة مرة أخرى لاحقاً.",
		INVALID_TWO_FACTOR_COOKIE: "ملف تعريف ارتباط التحقق الثنائي غير صحيح",
	},
	de: {
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
	},
	es: enVal,
	zh: enVal,
	ja: enVal,
	ko: enVal,
	pt: enVal,
	it: enVal,
	ru: enVal,
	tr: enVal,
	nl: enVal,
	pl: enVal,
	sv: enVal,
	vi: enVal,
	hi: enVal,
	id: enVal,
	uk: enVal,
	bn: enVal,
	th: enVal,
	fa: enVal,
};
