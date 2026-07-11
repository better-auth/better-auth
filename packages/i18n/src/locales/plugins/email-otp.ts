import type { EMAIL_OTP_ERROR_CODES } from "better-auth/plugins/email-otp";
import type { PluginErrorTranslations } from "../../types";

export const emailOtpTranslations: PluginErrorTranslations<
	typeof EMAIL_OTP_ERROR_CODES
> = {
	en: {
		OTP_EXPIRED: "OTP expired",
		INVALID_OTP: "Invalid OTP",
		TOO_MANY_ATTEMPTS: "Too many attempts",
	},
	fr: {
		OTP_EXPIRED: "Le code OTP a expiré",
		INVALID_OTP: "Code OTP invalide",
		TOO_MANY_ATTEMPTS: "Trop de tentatives. Veuillez réessayer plus tard.",
	},
	ar: {
		OTP_EXPIRED: "انتهت صلاحية رمز OTP",
		INVALID_OTP: "رمز OTP غير صالح",
		TOO_MANY_ATTEMPTS: "محاولات كثيرة جداً. يرجى المحاولة مرة أخرى لاحقاً.",
	},
	de: {
		OTP_EXPIRED: "OTP ist abgelaufen",
		INVALID_OTP: "Ungültiges OTP",
		TOO_MANY_ATTEMPTS:
			"Zu viele Versuche. Bitte versuchen Sie es später noch einmal.",
	},
	es: {
		OTP_EXPIRED: "OTP expirado",
		INVALID_OTP: "OTP inválido",
		TOO_MANY_ATTEMPTS: "Demasiados intentos. Por favor, intenta más tarde.",
	},
	zh: {
		OTP_EXPIRED: "验证码已过期",
		INVALID_OTP: "验证码无效",
		TOO_MANY_ATTEMPTS: "尝试次数过多，请稍后再试。",
	},
	ja: {
		OTP_EXPIRED: "OTPの有効期限が切れました",
		INVALID_OTP: "無効なOTPです",
		TOO_MANY_ATTEMPTS:
			"試行回数が多すぎます。しばらく後でもう一度お試しください。",
	},
	ko: {
		OTP_EXPIRED: "OTP가 만료되었습니다",
		INVALID_OTP: "유효하지 않은 OTP입니다",
		TOO_MANY_ATTEMPTS: "시도 횟수가 너무 많습니다. 나중에 다시 시도하세요.",
	},
	pt: {
		OTP_EXPIRED: "OTP expirou",
		INVALID_OTP: "OTP inválido",
		TOO_MANY_ATTEMPTS:
			"Tentativas demais. Por favor, tente novamente mais tarde.",
	},
	it: {
		OTP_EXPIRED: "OTP scaduto",
		INVALID_OTP: "OTP non valido",
		TOO_MANY_ATTEMPTS: "Troppi tentativi. Riprova più tardi.",
	},
	ru: {
		OTP_EXPIRED: "OTP истёк",
		INVALID_OTP: "Неверный OTP",
		TOO_MANY_ATTEMPTS: "Слишком много попыток. Попробуйте позже.",
	},
	tr: {
		OTP_EXPIRED: "OTP süresi doldu",
		INVALID_OTP: "Geçersiz OTP",
		TOO_MANY_ATTEMPTS: "Çok fazla deneme. Lütfen daha sonra tekrar deneyin.",
	},
	nl: {
		OTP_EXPIRED: "OTP is verlopen",
		INVALID_OTP: "Ongeldige OTP",
		TOO_MANY_ATTEMPTS: "Te veel pogingen. Probeer het later opnieuw.",
	},
	pl: {
		OTP_EXPIRED: "OTP wygasł",
		INVALID_OTP: "Nieprawidłowy OTP",
		TOO_MANY_ATTEMPTS: "Zbyt wiele prób. Spróbuj ponownie później.",
	},
	sv: {
		OTP_EXPIRED: "OTP har gått ut",
		INVALID_OTP: "Ogiltig OTP",
		TOO_MANY_ATTEMPTS: "För många försök. Försök igen senare.",
	},
	vi: {
		OTP_EXPIRED: "OTP đã hết hạn",
		INVALID_OTP: "OTP không hợp lệ",
		TOO_MANY_ATTEMPTS: "Quá nhiều lần thử. Vui lòng thử lại sau.",
	},
	hi: {
		OTP_EXPIRED: "OTP समाप्त हो गया है",
		INVALID_OTP: "अमान्य OTP",
		TOO_MANY_ATTEMPTS: "बहुत अधिक प्रयास। कृपया बाद में पुनः प्रयास करें।",
	},
	id: {
		OTP_EXPIRED: "OTP telah kedaluwarsa",
		INVALID_OTP: "OTP tidak valid",
		TOO_MANY_ATTEMPTS: "Terlalu banyak percobaan. Silakan coba lagi nanti.",
	},
	uk: {
		OTP_EXPIRED: "OTP закінчився",
		INVALID_OTP: "Недійсний OTP",
		TOO_MANY_ATTEMPTS: "Забагато спроб. Будь ласка, спробуйте пізніше.",
	},
	bn: {
		OTP_EXPIRED: "OTP মেয়াদ শেষ হয়ে গেছে",
		INVALID_OTP: "অবৈধ OTP",
		TOO_MANY_ATTEMPTS: "অনেক বেশি চেষ্টা হয়েছে। পরে আবার চেষ্টা করুন।",
	},
	th: {
		OTP_EXPIRED: "OTP หมดอายุแล้ว",
		INVALID_OTP: "OTP ไม่ถูกต้อง",
		TOO_MANY_ATTEMPTS: "พยายามมากเกินไป กรุณาลองใหม่ในภายหลัง",
	},
	fa: {
		OTP_EXPIRED: "OTP منقضی شده است",
		INVALID_OTP: "OTP نامعتبر است",
		TOO_MANY_ATTEMPTS:
			"تلاش‌های زیادی انجام شده است. لطفاً بعداً دوباره امتحان کنید.",
	},
};
