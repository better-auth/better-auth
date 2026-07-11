import type { captcha } from "better-auth/plugins";
import type { PluginErrorTranslations } from "../../types";

type CaptchaErrorCodes = ReturnType<typeof captcha>["$ERROR_CODES"];

export const captchaTranslations: PluginErrorTranslations<CaptchaErrorCodes> = {
	ar: {
		VERIFICATION_FAILED: "فشل التحقق من الكابتشا",
		MISSING_RESPONSE: "استجابة CAPTCHA مفقودة",
		UNKNOWN_ERROR: "حدث خطأ ما",
	},
	bn: {
		VERIFICATION_FAILED: "ক্যাপচা যাচাইকরণ ব্যর্থ হয়েছে",
		MISSING_RESPONSE: "CAPTCHA উত্তর অনুপস্থিত",
		UNKNOWN_ERROR: "কিছু একটা ভুল হয়েছে",
	},
	de: {
		VERIFICATION_FAILED: "Captcha-Überprüfung fehlgeschlagen",
		MISSING_RESPONSE: "CAPTCHA-Antwort fehlt",
		UNKNOWN_ERROR: "Etwas ist schiefgelaufen",
	},
	en: {
		VERIFICATION_FAILED: "Captcha verification failed",
		MISSING_RESPONSE: "Missing CAPTCHA response",
		UNKNOWN_ERROR: "Something went wrong",
	},
	es: {
		VERIFICATION_FAILED: "La verificación del captcha falló",
		MISSING_RESPONSE: "Falta la respuesta del CAPTCHA",
		UNKNOWN_ERROR: "Algo salió mal",
	},
	fa: {
		VERIFICATION_FAILED: "تأیید کپچا ناموفق بود",
		MISSING_RESPONSE: "پاسخ CAPTCHA وجود ندارد",
		UNKNOWN_ERROR: "مشکلی پیش آمده است",
	},
	fr: {
		VERIFICATION_FAILED: "La vérification du captcha a échoué",
		MISSING_RESPONSE: "Réponse CAPTCHA manquante",
		UNKNOWN_ERROR: "Une erreur s'est produite",
	},
	hi: {
		VERIFICATION_FAILED: "कैप्चा सत्यापन विफल हो गया",
		MISSING_RESPONSE: "CAPTCHA प्रतिक्रिया अनुपस्थित है",
		UNKNOWN_ERROR: "कुछ गलत हो गया",
	},
	id: {
		VERIFICATION_FAILED: "Verifikasi captcha gagal",
		MISSING_RESPONSE: "Respons CAPTCHA tidak ada",
		UNKNOWN_ERROR: "Terjadi kesalahan",
	},
	it: {
		VERIFICATION_FAILED: "Verifica captcha non riuscita",
		MISSING_RESPONSE: "Risposta CAPTCHA mancante",
		UNKNOWN_ERROR: "Qualcosa è andato storto",
	},
	ja: {
		VERIFICATION_FAILED: "Captchaの検証に失敗しました",
		MISSING_RESPONSE: "CAPTCHAの回答がありません",
		UNKNOWN_ERROR: "問題が発生しました",
	},
	ko: {
		VERIFICATION_FAILED: "캡차 인증에 실패했습니다",
		MISSING_RESPONSE: "CAPTCHA 응답이 없습니다",
		UNKNOWN_ERROR: "문제가 발생했습니다",
	},
	nl: {
		VERIFICATION_FAILED: "Captcha-verificatie mislukt",
		MISSING_RESPONSE: "CAPTCHA-antwoord ontbreekt",
		UNKNOWN_ERROR: "Er is iets misgegaan",
	},
	pl: {
		VERIFICATION_FAILED: "Weryfikacja captcha nie powiodła się",
		MISSING_RESPONSE: "Brak odpowiedzi CAPTCHA",
		UNKNOWN_ERROR: "Coś poszło nie tak",
	},
	pt: {
		VERIFICATION_FAILED: "A verificação do captcha falhou",
		MISSING_RESPONSE: "Resposta do CAPTCHA ausente",
		UNKNOWN_ERROR: "Algo deu errado",
	},
	ru: {
		VERIFICATION_FAILED: "Проверка капчи не удалась",
		MISSING_RESPONSE: "Отсутствует ответ CAPTCHA",
		UNKNOWN_ERROR: "Что-то пошло не так",
	},
	sv: {
		VERIFICATION_FAILED: "Captcha-verifieringen misslyckades",
		MISSING_RESPONSE: "CAPTCHA-svar saknas",
		UNKNOWN_ERROR: "Något gick fel",
	},
	th: {
		VERIFICATION_FAILED: "การยืนยัน Captcha ล้มเหลว",
		MISSING_RESPONSE: "ไม่มีการตอบสนอง CAPTCHA",
		UNKNOWN_ERROR: "เกิดข้อผิดพลาดบางอย่าง",
	},
	tr: {
		VERIFICATION_FAILED: "Captcha doğrulaması başarısız oldu",
		MISSING_RESPONSE: "CAPTCHA yanıtı eksik",
		UNKNOWN_ERROR: "Bir şeyler ters gitti",
	},
	uk: {
		VERIFICATION_FAILED: "Перевірка капчі не вдалася",
		MISSING_RESPONSE: "Відповідь CAPTCHA відсутня",
		UNKNOWN_ERROR: "Щось пішло не так",
	},
	vi: {
		VERIFICATION_FAILED: "Xác minh captcha thất bại",
		MISSING_RESPONSE: "Thiếu phản hồi CAPTCHA",
		UNKNOWN_ERROR: "Đã xảy ra lỗi",
	},
	zh: {
		VERIFICATION_FAILED: "验证码验证失败",
		MISSING_RESPONSE: "缺少 CAPTCHA 响应",
		UNKNOWN_ERROR: "出现了一些问题",
	},
};
