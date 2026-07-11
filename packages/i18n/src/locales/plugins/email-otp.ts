import type { EMAIL_OTP_ERROR_CODES } from "better-auth/plugins/email-otp";
import type { PluginErrorTranslations } from "../../types";

const enVal = {
	OTP_EXPIRED: "The OTP has expired. Please request a new one.",
	INVALID_OTP: "The code you entered is invalid. Please check and try again.",
	TOO_MANY_ATTEMPTS: "Too many attempts. Please try again later.",
};

export const emailOtpTranslations: PluginErrorTranslations<
	typeof EMAIL_OTP_ERROR_CODES
> = {
	en: enVal,
	fr: {
		OTP_EXPIRED: "Le code a expiré. Veuillez en demander un nouveau.",
		INVALID_OTP:
			"Le code que vous avez entré est invalide. Veuillez vérifier et réessayer.",
		TOO_MANY_ATTEMPTS: "Trop de tentatives. Veuillez réessayer plus tard.",
	},
	ar: {
		OTP_EXPIRED: "انتهت صلاحية الرمز. يرجى طلب رمز جديد.",
		INVALID_OTP: "الرمز غير صحيح. تحقق وحاول مرة أخرى.",
		TOO_MANY_ATTEMPTS: "محاولات كثيرة جداً. يرجى المحاولة مرة أخرى لاحقاً.",
	},
	de: {
		OTP_EXPIRED: "Das OTP ist abgelaufen. Bitte fordern Sie ein neues an.",
		INVALID_OTP:
			"Der eingegebene Code ist ungültig. Bitte überprüfen Sie ihn und versuchen Sie es erneut.",
		TOO_MANY_ATTEMPTS:
			"Zu viele Versuche. Bitte versuchen Sie es später noch einmal.",
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
