import type { EMAIL_OTP_ERROR_CODES } from "better-auth/plugins/email-otp";
import type { PluginErrorTranslations } from "../../types";

export const emailOtpTranslations: PluginErrorTranslations<
	typeof EMAIL_OTP_ERROR_CODES
> = {
	en: {
		OTP_EXPIRED: "The OTP has expired. Please request a new one.",
		INVALID_OTP: "The code you entered is invalid. Please check and try again.",
		TOO_MANY_ATTEMPTS: "Too many attempts. Please try again later.",
	},
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
	es: {
		OTP_EXPIRED: "El código ha expirado. Por favor, solicita uno nuevo.",
		INVALID_OTP:
			"El código que ingresaste es inválido. Por favor, verifica e intenta de nuevo.",
		TOO_MANY_ATTEMPTS: "Demasiados intentos. Por favor, intenta más tarde.",
	},
	zh: {
		OTP_EXPIRED: "验证码已过期，请重新获取。",
		INVALID_OTP: "您输入的验证码无效，请检查后重试。",
		TOO_MANY_ATTEMPTS: "尝试次数过多，请稍后再试。",
	},
	ja: {
		OTP_EXPIRED:
			"OTPの有効期限が切れました。新しいコードをリクエストしてください。",
		INVALID_OTP: "入力したコードが無効です。確認して再試行してください。",
		TOO_MANY_ATTEMPTS:
			"試行回数が多すぎます。しばらく後でもう一度お試しください。",
	},
	ko: {
		OTP_EXPIRED: "OTP가 만료되었습니다. 새로운 코드를 요청하세요.",
		INVALID_OTP: "입력한 코드가 유효하지 않습니다. 확인 후 다시 시도하세요.",
		TOO_MANY_ATTEMPTS: "시도 횟수가 너무 많습니다. 나중에 다시 시도하세요.",
	},
	pt: {
		OTP_EXPIRED: "O código expirou. Por favor, solicite um novo.",
		INVALID_OTP:
			"O código que você inseriu é inválido. Por favor, verifique e tente novamente.",
		TOO_MANY_ATTEMPTS:
			"Tentativas demais. Por favor, tente novamente mais tarde.",
	},
	it: {
		OTP_EXPIRED: "Il codice è scaduto. Richiedine uno nuovo.",
		INVALID_OTP: "Il codice inserito non è valido. Controlla e riprova.",
		TOO_MANY_ATTEMPTS: "Troppi tentativi. Riprova più tardi.",
	},
	ru: {
		OTP_EXPIRED: "Срок действия кода истёк. Пожалуйста, запросите новый.",
		INVALID_OTP: "Введённый код недействителен. Проверьте и попробуйте снова.",
		TOO_MANY_ATTEMPTS: "Слишком много попыток. Попробуйте позже.",
	},
	tr: {
		OTP_EXPIRED: "Kod süresi doldu. Lütfen yeni bir kod talep edin.",
		INVALID_OTP: "Girdiğiniz kod geçersiz. Lütfen kontrol edip tekrar deneyin.",
		TOO_MANY_ATTEMPTS: "Çok fazla deneme. Lütfen daha sonra tekrar deneyin.",
	},
	nl: {
		OTP_EXPIRED: "De code is verlopen. Vraag een nieuwe aan.",
		INVALID_OTP:
			"De ingevoerde code is ongeldig. Controleer het en probeer opnieuw.",
		TOO_MANY_ATTEMPTS: "Te veel pogingen. Probeer het later opnieuw.",
	},
	pl: {
		OTP_EXPIRED: "Kod wygasł. Poproś o nowy.",
		INVALID_OTP:
			"Wprowadzony kod jest nieprawidłowy. Sprawdź i spróbuj ponownie.",
		TOO_MANY_ATTEMPTS: "Zbyt wiele prób. Spróbuj ponownie później.",
	},
	sv: {
		OTP_EXPIRED: "Koden har gått ut. Vänligen begär en ny.",
		INVALID_OTP: "Koden du angav är ogiltig. Kontrollera och försök igen.",
		TOO_MANY_ATTEMPTS: "För många försök. Försök igen senare.",
	},
	vi: {
		OTP_EXPIRED: "Mã đã hết hạn. Vui lòng yêu cầu mã mới.",
		INVALID_OTP: "Mã bạn nhập không hợp lệ. Vui lòng kiểm tra và thử lại.",
		TOO_MANY_ATTEMPTS: "Quá nhiều lần thử. Vui lòng thử lại sau.",
	},
	hi: {
		OTP_EXPIRED: "OTP की समय सीमा समाप्त हो गई है। कृपया नया OTP अनुरोध करें।",
		INVALID_OTP: "आपने जो कोड दर्ज किया वह अमान्य है। कृपया जाँचें और पुनः प्रयास करें।",
		TOO_MANY_ATTEMPTS: "बहुत अधिक प्रयास। कृपया बाद में पुनः प्रयास करें।",
	},
	id: {
		OTP_EXPIRED: "Kode OTP telah kedaluwarsa. Silakan minta yang baru.",
		INVALID_OTP: "Kode yang Anda masukkan tidak valid. Periksa dan coba lagi.",
		TOO_MANY_ATTEMPTS: "Terlalu banyak percobaan. Silakan coba lagi nanti.",
	},
	uk: {
		OTP_EXPIRED: "Термін дії коду закінчився. Будь ласка, запросіть новий.",
		INVALID_OTP: "Введений код недійсний. Перевірте і спробуйте ще раз.",
		TOO_MANY_ATTEMPTS: "Забагато спроб. Будь ласка, спробуйте пізніше.",
	},
	bn: {
		OTP_EXPIRED: "OTP মেয়াদ শেষ হয়ে গেছে। অনুগ্রহ করে নতুন একটি চাইন।",
		INVALID_OTP: "আপনি যে কোড দিয়েছেন তা ভুল। অনুগ্রহ করে পরীক্ষা করে আবার চেষ্টা করুন।",
		TOO_MANY_ATTEMPTS: "অনেক বেশি চেষ্টা হয়েছে। পরে আবার চেষ্টা করুন।",
	},
	th: {
		OTP_EXPIRED: "OTP หมดอายุแล้ว กรุณาขอรหัสใหม่",
		INVALID_OTP: "รหัสที่คุณกรอกไม่ถูกต้อง กรุณาตรวจสอบและลองอีกครั้ง",
		TOO_MANY_ATTEMPTS: "พยายามมากเกินไป กรุณาลองใหม่ในภายหลัง",
	},
	fa: {
		OTP_EXPIRED: "کد منقضی شده است. لطفاً یک کد جدید درخواست کنید.",
		INVALID_OTP:
			"کدی که وارد کردید نادرست است. لطفاً بررسی کنید و دوباره امتحان کنید.",
		TOO_MANY_ATTEMPTS:
			"تلاش‌های زیادی انجام شده است. لطفاً بعداً دوباره امتحان کنید.",
	},
};
