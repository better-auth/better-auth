import type { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins/two-factor";
import type { ErrorTranslations } from "../../types";

export const twoFactorTranslations: ErrorTranslations<
	typeof TWO_FACTOR_ERROR_CODES
> = {
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
	bn: {
		OTP_NOT_ENABLED: "OTP সক্রিয় নেই",
		OTP_NOT_CONFIGURED: "OTP কনফিগার করা হয়নি",
		OTP_HAS_EXPIRED: "OTP মেয়াদ শেষ হয়ে গেছে",
		TOTP_NOT_ENABLED: "TOTP সক্রিয় নেই",
		TOTP_NOT_CONFIGURED: "TOTP কনফিগার করা হয়নি",
		TWO_FACTOR_NOT_ENABLED: "দুই-ফ্যাক্টর প্রমাণীকরণ সক্রিয় নেই",
		BACKUP_CODES_NOT_ENABLED: "ব্যাকআপ কোড সক্রিয় নেই",
		INVALID_BACKUP_CODE: "ব্যাকআপ কোড অবৈধ বা ইতিমধ্যে ব্যবহৃত হয়েছে।",
		INVALID_CODE: "আপনি যে কোড দিয়েছেন তা ভুল। অনুগ্রহ করে পরীক্ষা করে আবার চেষ্টা করুন।",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"অনেক বেশি চেষ্টা হয়েছে। অনুগ্রহ করে নতুন কোড অনুরোধ করুন।",
		ACCOUNT_TEMPORARILY_LOCKED:
			"অনেক বেশি যাচাইকরণ ব্যর্থতা। আপনার অ্যাকাউন্ট সাময়িকভাবে লক করা হয়েছে। পরে আবার চেষ্টা করুন।",
		INVALID_TWO_FACTOR_COOKIE: "দুই-ফ্যাক্টর প্রমাণীকরণ কুকি অবৈধ",
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
	en: {
		OTP_NOT_ENABLED: "OTP not enabled",
		OTP_NOT_CONFIGURED: "OTP not configured",
		OTP_HAS_EXPIRED: "OTP has expired",
		TOTP_NOT_ENABLED: "TOTP not enabled",
		TOTP_NOT_CONFIGURED: "TOTP not configured",
		TWO_FACTOR_NOT_ENABLED: "Two factor isn't enabled",
		BACKUP_CODES_NOT_ENABLED: "Backup codes aren't enabled",
		INVALID_BACKUP_CODE: "The backup code is invalid or has already been used.",
		INVALID_CODE:
			"The code you entered is invalid. Please check and try again.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"Too many attempts. Please request a new code.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"Too many failed verification attempts. Your account is temporarily locked. Please try again later.",
		INVALID_TWO_FACTOR_COOKIE: "Invalid two factor cookie",
	},
	es: {
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
	},
	fa: {
		OTP_NOT_ENABLED: "OTP فعال نشده است",
		OTP_NOT_CONFIGURED: "OTP پیکربندی نشده است",
		OTP_HAS_EXPIRED: "OTP منقضی شده است",
		TOTP_NOT_ENABLED: "TOTP فعال نشده است",
		TOTP_NOT_CONFIGURED: "TOTP پیکربندی نشده است",
		TWO_FACTOR_NOT_ENABLED: "احراز هویت دو مرحله‌ای فعال نشده است",
		BACKUP_CODES_NOT_ENABLED: "کدهای پشتیبان فعال نشده‌اند",
		INVALID_BACKUP_CODE: "کد پشتیبان نامعتبر است یا قبلاً استفاده شده است.",
		INVALID_CODE:
			"کدی که وارد کردید نادرست است. لطفاً بررسی کنید و دوباره امتحان کنید.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"تلاش‌های زیادی انجام شده است. لطفاً یک کد جدید درخواست کنید.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"تلاش‌های تأیید هویت زیادی ناموفق بوده است. حساب شما موقتاً قفل شده است. لطفاً بعداً دوباره امتحان کنید.",
		INVALID_TWO_FACTOR_COOKIE: "کوکی احراز هویت دو مرحله‌ای نامعتبر است",
	},
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
	hi: {
		OTP_NOT_ENABLED: "OTP सक्षम नहीं है",
		OTP_NOT_CONFIGURED: "OTP कॉन्फ़िगर नहीं है",
		OTP_HAS_EXPIRED: "OTP की समय सीमा समाप्त हो गई है",
		TOTP_NOT_ENABLED: "TOTP सक्षम नहीं है",
		TOTP_NOT_CONFIGURED: "TOTP कॉन्फ़िगर नहीं है",
		TWO_FACTOR_NOT_ENABLED: "दो-कारक प्रमाणीकरण सक्षम नहीं है",
		BACKUP_CODES_NOT_ENABLED: "बैकअप कोड सक्षम नहीं हैं",
		INVALID_BACKUP_CODE: "बैकअप कोड अमान्य है या पहले ही उपयोग किया जा चुका है।",
		INVALID_CODE: "आपने जो कोड दर्ज किया वह अमान्य है। कृपया जाँचें और पुनः प्रयास करें।",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"बहुत अधिक प्रयास। कृपया नया कोड अनुरोध करें।",
		ACCOUNT_TEMPORARILY_LOCKED:
			"बहुत अधिक सत्यापन विफलताएं। आपका खाता अस्थायी रूप से लॉक है। कृपया बाद में पुनः प्रयास करें।",
		INVALID_TWO_FACTOR_COOKIE: "दो-कारक प्रमाणीकरण कुकी अमान्य है",
	},
	id: {
		OTP_NOT_ENABLED: "OTP tidak diaktifkan",
		OTP_NOT_CONFIGURED: "OTP tidak dikonfigurasi",
		OTP_HAS_EXPIRED: "OTP telah kedaluwarsa",
		TOTP_NOT_ENABLED: "TOTP tidak diaktifkan",
		TOTP_NOT_CONFIGURED: "TOTP tidak dikonfigurasi",
		TWO_FACTOR_NOT_ENABLED: "Autentikasi dua faktor tidak diaktifkan",
		BACKUP_CODES_NOT_ENABLED: "Kode cadangan tidak diaktifkan",
		INVALID_BACKUP_CODE: "Kode cadangan tidak valid atau sudah digunakan.",
		INVALID_CODE: "Kode yang Anda masukkan tidak valid. Periksa dan coba lagi.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"Terlalu banyak percobaan. Silakan minta kode baru.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"Terlalu banyak percobaan verifikasi yang gagal. Akun Anda sementara dikunci. Silakan coba lagi nanti.",
		INVALID_TWO_FACTOR_COOKIE: "Cookie autentikasi dua faktor tidak valid",
	},
	it: {
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
	},
	ja: {
		OTP_NOT_ENABLED: "OTPが有効化されていません",
		OTP_NOT_CONFIGURED: "OTPが設定されていません",
		OTP_HAS_EXPIRED: "OTPの有効期限が切れました",
		TOTP_NOT_ENABLED: "TOTPが有効化されていません",
		TOTP_NOT_CONFIGURED: "TOTPが設定されていません",
		TWO_FACTOR_NOT_ENABLED: "二要素認証が有効化されていません",
		BACKUP_CODES_NOT_ENABLED: "バックアップコードが有効化されていません",
		INVALID_BACKUP_CODE: "バックアップコードが無効か、すでに使用されています。",
		INVALID_CODE: "入力したコードが無効です。確認して再試行してください。",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"試行回数が多すぎます。新しいコードをリクエストしてください。",
		ACCOUNT_TEMPORARILY_LOCKED:
			"認証失敗が多すぎます。アカウントは一時的にロックされています。後でもう一度お試しください。",
		INVALID_TWO_FACTOR_COOKIE: "二要素認証Cookieが無効です",
	},
	ko: {
		OTP_NOT_ENABLED: "OTP가 활성화되지 않았습니다",
		OTP_NOT_CONFIGURED: "OTP가 구성되지 않았습니다",
		OTP_HAS_EXPIRED: "OTP가 만료되었습니다",
		TOTP_NOT_ENABLED: "TOTP가 활성화되지 않았습니다",
		TOTP_NOT_CONFIGURED: "TOTP가 구성되지 않았습니다",
		TWO_FACTOR_NOT_ENABLED: "이중 인증이 활성화되지 않았습니다",
		BACKUP_CODES_NOT_ENABLED: "백업 코드가 활성화되지 않았습니다",
		INVALID_BACKUP_CODE: "백업 코드가 유효하지 않거나 이미 사용되었습니다.",
		INVALID_CODE: "입력한 코드가 유효하지 않습니다. 확인 후 다시 시도하세요.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"시도 횟수가 너무 많습니다. 새 코드를 요청하세요.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"인증 실패가 너무 많습니다. 계정이 일시적으로 잠겼습니다. 나중에 다시 시도하세요.",
		INVALID_TWO_FACTOR_COOKIE: "이중 인증 쿠키가 유효하지 않습니다",
	},
	nl: {
		OTP_NOT_ENABLED: "OTP niet ingeschakeld",
		OTP_NOT_CONFIGURED: "OTP niet geconfigureerd",
		OTP_HAS_EXPIRED: "OTP is verlopen",
		TOTP_NOT_ENABLED: "TOTP niet ingeschakeld",
		TOTP_NOT_CONFIGURED: "TOTP niet geconfigureerd",
		TWO_FACTOR_NOT_ENABLED: "Tweestapsverificatie is niet ingeschakeld",
		BACKUP_CODES_NOT_ENABLED: "Back-upcodes zijn niet ingeschakeld",
		INVALID_BACKUP_CODE: "De back-upcode is ongeldig of al gebruikt.",
		INVALID_CODE:
			"De ingevoerde code is ongeldig. Controleer het en probeer opnieuw.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"Te veel pogingen. Vraag een nieuwe code aan.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"Te veel mislukte verificatiepogingen. Uw account is tijdelijk vergrendeld. Probeer het later opnieuw.",
		INVALID_TWO_FACTOR_COOKIE: "Ongeldige tweestapsverificatiecookie",
	},
	pl: {
		OTP_NOT_ENABLED: "OTP nie jest włączony",
		OTP_NOT_CONFIGURED: "OTP nie jest skonfigurowany",
		OTP_HAS_EXPIRED: "OTP wygasł",
		TOTP_NOT_ENABLED: "TOTP nie jest włączony",
		TOTP_NOT_CONFIGURED: "TOTP nie jest skonfigurowany",
		TWO_FACTOR_NOT_ENABLED: "Uwierzytelnianie dwuskładnikowe nie jest włączone",
		BACKUP_CODES_NOT_ENABLED: "Kody zapasowe nie są włączone",
		INVALID_BACKUP_CODE:
			"Kod zapasowy jest nieprawidłowy lub już został użyty.",
		INVALID_CODE:
			"Wprowadzony kod jest nieprawidłowy. Sprawdź i spróbuj ponownie.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "Zbyt wiele prób. Poproś o nowy kod.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"Zbyt wiele nieudanych prób weryfikacji. Twoje konto jest tymczasowo zablokowane. Spróbuj ponownie później.",
		INVALID_TWO_FACTOR_COOKIE:
			"Nieprawidłowy plik cookie uwierzytelniania dwuskładnikowego",
	},
	pt: {
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
	},
	ru: {
		OTP_NOT_ENABLED: "OTP не включён",
		OTP_NOT_CONFIGURED: "OTP не настроен",
		OTP_HAS_EXPIRED: "OTP истёк",
		TOTP_NOT_ENABLED: "TOTP не включён",
		TOTP_NOT_CONFIGURED: "TOTP не настроен",
		TWO_FACTOR_NOT_ENABLED: "Двухфакторная аутентификация не включена",
		BACKUP_CODES_NOT_ENABLED: "Резервные коды не включены",
		INVALID_BACKUP_CODE: "Резервный код недействителен или уже использован.",
		INVALID_CODE: "Введённый код недействителен. Проверьте и попробуйте снова.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"Слишком много попыток. Пожалуйста, запросите новый код.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"Слишком много неудачных попыток верификации. Ваша учётная запись временно заблокирована. Попробуйте позже.",
		INVALID_TWO_FACTOR_COOKIE:
			"Недействительный cookie двухфакторной аутентификации",
	},
	sv: {
		OTP_NOT_ENABLED: "OTP är inte aktiverat",
		OTP_NOT_CONFIGURED: "OTP är inte konfigurerat",
		OTP_HAS_EXPIRED: "OTP har gått ut",
		TOTP_NOT_ENABLED: "TOTP är inte aktiverat",
		TOTP_NOT_CONFIGURED: "TOTP är inte konfigurerat",
		TWO_FACTOR_NOT_ENABLED: "Tvåfaktorsautentisering är inte aktiverad",
		BACKUP_CODES_NOT_ENABLED: "Reservkoder är inte aktiverade",
		INVALID_BACKUP_CODE: "Reservkoden är ogiltig eller har redan använts.",
		INVALID_CODE: "Koden du angav är ogiltig. Kontrollera och försök igen.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "För många försök. Begär en ny kod.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"För många misslyckade verifieringsförsök. Ditt konto är tillfälligt låst. Försök igen senare.",
		INVALID_TWO_FACTOR_COOKIE: "Ogiltig tvåfaktors-cookie",
	},
	th: {
		OTP_NOT_ENABLED: "OTP ยังไม่ได้เปิดใช้งาน",
		OTP_NOT_CONFIGURED: "OTP ยังไม่ได้ตั้งค่า",
		OTP_HAS_EXPIRED: "OTP หมดอายุแล้ว",
		TOTP_NOT_ENABLED: "TOTP ยังไม่ได้เปิดใช้งาน",
		TOTP_NOT_CONFIGURED: "TOTP ยังไม่ได้ตั้งค่า",
		TWO_FACTOR_NOT_ENABLED: "การยืนยันตัวตนสองปัจจัยยังไม่ได้เปิดใช้งาน",
		BACKUP_CODES_NOT_ENABLED: "รหัสสำรองยังไม่ได้เปิดใช้งาน",
		INVALID_BACKUP_CODE: "รหัสสำรองไม่ถูกต้องหรือถูกใช้ไปแล้ว",
		INVALID_CODE: "รหัสที่คุณกรอกไม่ถูกต้อง กรุณาตรวจสอบและลองอีกครั้ง",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "พยายามมากเกินไป กรุณาขอรหัสใหม่",
		ACCOUNT_TEMPORARILY_LOCKED:
			"การยืนยันตัวตนล้มเหลวหลายครั้ง บัญชีของคุณถูกล็อกชั่วคราว กรุณาลองใหม่ในภายหลัง",
		INVALID_TWO_FACTOR_COOKIE: "คุกกี้การยืนยันตัวตนสองปัจจัยไม่ถูกต้อง",
	},
	tr: {
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
	},
	uk: {
		OTP_NOT_ENABLED: "OTP не увімкнено",
		OTP_NOT_CONFIGURED: "OTP не налаштовано",
		OTP_HAS_EXPIRED: "OTP закінчився",
		TOTP_NOT_ENABLED: "TOTP не увімкнено",
		TOTP_NOT_CONFIGURED: "TOTP не налаштовано",
		TWO_FACTOR_NOT_ENABLED: "Двофакторна аутентифікація не увімкнена",
		BACKUP_CODES_NOT_ENABLED: "Резервні коди не увімкнено",
		INVALID_BACKUP_CODE: "Резервний код недійсний або вже використаний.",
		INVALID_CODE: "Введений код недійсний. Перевірте і спробуйте ще раз.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"Забагато спроб. Будь ласка, запросіть новий код.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"Забагато невдалих спроб верифікації. Ваш обліковий запис тимчасово заблоковано. Спробуйте пізніше.",
		INVALID_TWO_FACTOR_COOKIE: "Недійсний cookie двофакторної аутентифікації",
	},
	vi: {
		OTP_NOT_ENABLED: "OTP chưa được bật",
		OTP_NOT_CONFIGURED: "OTP chưa được cấu hình",
		OTP_HAS_EXPIRED: "OTP đã hết hạn",
		TOTP_NOT_ENABLED: "TOTP chưa được bật",
		TOTP_NOT_CONFIGURED: "TOTP chưa được cấu hình",
		TWO_FACTOR_NOT_ENABLED: "Xác thực hai yếu tố chưa được bật",
		BACKUP_CODES_NOT_ENABLED: "Mã dự phòng chưa được bật",
		INVALID_BACKUP_CODE: "Mã dự phòng không hợp lệ hoặc đã được sử dụng.",
		INVALID_CODE: "Mã bạn nhập không hợp lệ. Vui lòng kiểm tra và thử lại.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"Quá nhiều lần thử. Vui lòng yêu cầu mã mới.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"Quá nhiều lần xác thực thất bại. Tài khoản của bạn tạm thời bị khóa. Vui lòng thử lại sau.",
		INVALID_TWO_FACTOR_COOKIE: "Cookie xác thực hai yếu tố không hợp lệ",
	},
	zh: {
		OTP_NOT_ENABLED: "OTP 未启用",
		OTP_NOT_CONFIGURED: "OTP 未配置",
		OTP_HAS_EXPIRED: "OTP 已过期",
		TOTP_NOT_ENABLED: "TOTP 未启用",
		TOTP_NOT_CONFIGURED: "TOTP 未配置",
		TWO_FACTOR_NOT_ENABLED: "双重验证未启用",
		BACKUP_CODES_NOT_ENABLED: "备用代码未启用",
		INVALID_BACKUP_CODE: "备用代码无效或已使用。",
		INVALID_CODE: "您输入的验证码无效，请检查后重试。",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "尝试次数过多，请重新获取验证码。",
		ACCOUNT_TEMPORARILY_LOCKED:
			"验证失败次数过多，您的账户已被临时锁定，请稍后再试。",
		INVALID_TWO_FACTOR_COOKIE: "双重验证 Cookie 无效",
	},
};
