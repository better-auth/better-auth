import type { PASSKEY_ERROR_CODES } from "@better-auth/passkey";
import type { PluginErrorTranslations } from "../../types";

export const passkeyTranslations: PluginErrorTranslations<
	typeof PASSKEY_ERROR_CODES
> = {
	ar: {
		CHALLENGE_NOT_FOUND: "التحدي غير موجود",
		YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
			"غير مسموح لك بتسجيل مفتاح المرور هذا",
		FAILED_TO_VERIFY_REGISTRATION: "فشل التحقق من التسجيل",
		PASSKEY_NOT_FOUND: "مفتاح المرور غير موجود",
		AUTHENTICATION_FAILED: "فشلت عملية المصادقة",
		UNABLE_TO_CREATE_SESSION: "غير قادر على إنشاء الجلسة",
		FAILED_TO_UPDATE_PASSKEY: "فشل تحديث مفتاح المرور",
		PREVIOUSLY_REGISTERED: "مسجل مسبقًا",
		REGISTRATION_CANCELLED: "تم إلغاء التسجيل",
		AUTH_CANCELLED: "تم إلغاء المصادقة",
		UNKNOWN_ERROR: "حدث خطأ غير معروف",
		SESSION_REQUIRED: "يتطلب تسجيل مفتاح المرور جلسة مصادقة",
		RESOLVE_USER_REQUIRED:
			"يتطلب تسجيل مفتاح المرور إما جلسة مصادقة أو دالة استدعاء resolveUser عند تعيين requireSession إلى false",
		RESOLVED_USER_INVALID: "المستخدم الذي تم حله غير صالح",
	},
	bn: {
		CHALLENGE_NOT_FOUND: "চ্যালেঞ্জ পাওয়া যায়নি",
		YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
			"আপনার এই পাসকি নিবন্ধন করার অনুমতি নেই",
		FAILED_TO_VERIFY_REGISTRATION: "নিবন্ধন যাচাই করতে ব্যর্থ হয়েছে",
		PASSKEY_NOT_FOUND: "পাসকি পাওয়া যায়নি",
		AUTHENTICATION_FAILED: "প্রমাণীকরণ ব্যর্থ হয়েছে",
		UNABLE_TO_CREATE_SESSION: "সেশন তৈরি করতে অক্ষম",
		FAILED_TO_UPDATE_PASSKEY: "পাসকি আপডেট করতে ব্যর্থ হয়েছে",
		PREVIOUSLY_REGISTERED: "ইতিমধ্যে নিবন্ধিত",
		REGISTRATION_CANCELLED: "নিবন্ধন বাতিল করা হয়েছে",
		AUTH_CANCELLED: "প্রমাণীকরণ বাতিল করা হয়েছে",
		UNKNOWN_ERROR: "অজানা ত্রুটি দেখা দিয়েছে",
		SESSION_REQUIRED: "পাসকি নিবন্ধনের জন্য একটি প্রমাণিত সেশন প্রয়োজন",
		RESOLVE_USER_REQUIRED:
			"পাসকি নিবন্ধনের জন্য একটি প্রমাণিত সেশন বা resolveUser কলব্যাক প্রয়োজন যখন requireSession মিথ্যা হয়",
		RESOLVED_USER_INVALID: "সমাধানকৃত ব্যবহারকারী অবৈধ",
	},
	de: {
		CHALLENGE_NOT_FOUND: "Challenge nicht gefunden",
		YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
			"Sie dürfen diesen Passkey nicht registrieren",
		FAILED_TO_VERIFY_REGISTRATION: "Registrierungsverifizierung fehlgeschlagen",
		PASSKEY_NOT_FOUND: "Passkey nicht gefunden",
		AUTHENTICATION_FAILED: "Authentifizierung fehlgeschlagen",
		UNABLE_TO_CREATE_SESSION: "Sitzung konnte nicht erstellt werden",
		FAILED_TO_UPDATE_PASSKEY: "Passkey konnte nicht aktualisiert werden",
		PREVIOUSLY_REGISTERED: "Bereits registriert",
		REGISTRATION_CANCELLED: "Registrierung abgebrochen",
		AUTH_CANCELLED: "Authentifizierung abgebrochen",
		UNKNOWN_ERROR: "Unbekannter Fehler",
		SESSION_REQUIRED:
			"Die Passkey-Registrierung erfordert eine authentifizierte Sitzung",
		RESOLVE_USER_REQUIRED:
			"Die Passkey-Registrierung erfordert entweder eine authentifizierte Sitzung oder einen resolveUser-Callback, wenn requireSession false ist",
		RESOLVED_USER_INVALID: "Aufgelöster Benutzer ist ungültig",
	},
	en: {
		CHALLENGE_NOT_FOUND: "Challenge not found",
		YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
			"You are not allowed to register this passkey",
		FAILED_TO_VERIFY_REGISTRATION: "Failed to verify registration",
		PASSKEY_NOT_FOUND: "Passkey not found",
		AUTHENTICATION_FAILED: "Authentication failed",
		UNABLE_TO_CREATE_SESSION: "Unable to create session",
		FAILED_TO_UPDATE_PASSKEY: "Failed to update passkey",
		PREVIOUSLY_REGISTERED: "Previously registered",
		REGISTRATION_CANCELLED: "Registration cancelled",
		AUTH_CANCELLED: "Auth cancelled",
		UNKNOWN_ERROR: "Unknown error",
		SESSION_REQUIRED: "Passkey registration requires an authenticated session",
		RESOLVE_USER_REQUIRED:
			"Passkey registration requires either an authenticated session or a resolveUser callback when requireSession is false",
		RESOLVED_USER_INVALID: "Resolved user is invalid",
	},
	es: {
		CHALLENGE_NOT_FOUND: "Desafío no encontrado",
		YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
			"No tienes permiso para registrar esta llave de paso",
		FAILED_TO_VERIFY_REGISTRATION: "Error al verificar el registro",
		PASSKEY_NOT_FOUND: "Llave de paso no encontrada",
		AUTHENTICATION_FAILED: "Autenticación fallida",
		UNABLE_TO_CREATE_SESSION: "No se pudo crear la sesión",
		FAILED_TO_UPDATE_PASSKEY: "Error al actualizar la llave de paso",
		PREVIOUSLY_REGISTERED: "Registrado anteriormente",
		REGISTRATION_CANCELLED: "Registro cancelado",
		AUTH_CANCELLED: "Autenticación cancelada",
		UNKNOWN_ERROR: "Error desconocido",
		SESSION_REQUIRED:
			"El registro de la llave de paso requiere una sesión autenticada",
		RESOLVE_USER_REQUIRED:
			"El registro de la llave de paso requiere una sesión autenticada o una función callback resolveUser cuando requireSession es false",
		RESOLVED_USER_INVALID: "El usuario resuelto no es válido",
	},
	fa: {
		CHALLENGE_NOT_FOUND: "چالش یافت نشد",
		YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
			"شما مجاز به ثبت این کلید عبور نیستید",
		FAILED_TO_VERIFY_REGISTRATION: "تایید ثبت نام ناموفق بود",
		PASSKEY_NOT_FOUND: "کلید عبور یافت نشد",
		AUTHENTICATION_FAILED: "احراز هویت ناموفق بود",
		UNABLE_TO_CREATE_SESSION: "امکان ایجاد نشست وجود ندارد",
		FAILED_TO_UPDATE_PASSKEY: "بروزرسانی کلید عبور ناموفق بود",
		PREVIOUSLY_REGISTERED: "قبلا ثبت شده است",
		REGISTRATION_CANCELLED: "ثبت نام لغو شد",
		AUTH_CANCELLED: "احراز هویت لغو شد",
		UNKNOWN_ERROR: "خطای ناشناخته رخ داد",
		SESSION_REQUIRED: "ثبت کلید عبور نیاز به یک نشست احراز هویت شده دارد",
		RESOLVE_USER_REQUIRED:
			"ثبت کلید عبور نیاز به یک نشست احراز هویت شده یا یک تابع بازخورد resolveUser دارد زمانی که requireSession نادرست است",
		RESOLVED_USER_INVALID: "کاربر حل شده نامعتبر است",
	},
	fr: {
		CHALLENGE_NOT_FOUND: "Défi non trouvé",
		YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
			"Vous n'êtes pas autorisé à enregistrer cette clé de sécurité",
		FAILED_TO_VERIFY_REGISTRATION:
			"Échec de la vérification de l'enregistrement",
		PASSKEY_NOT_FOUND: "Clé de sécurité non trouvée",
		AUTHENTICATION_FAILED: "Échec de l'authentification",
		UNABLE_TO_CREATE_SESSION: "Impossible de créer la session",
		FAILED_TO_UPDATE_PASSKEY: "Échec de la mise à jour de la clé de sécurité",
		PREVIOUSLY_REGISTERED: "Déjà enregistré",
		REGISTRATION_CANCELLED: "Enregistrement annulé",
		AUTH_CANCELLED: "Authentification annulée",
		UNKNOWN_ERROR: "Erreur inconnue",
		SESSION_REQUIRED:
			"L'enregistrement de la clé de sécurité nécessite une session authentifiée",
		RESOLVE_USER_REQUIRED:
			"L'enregistrement de la clé de sécurité nécessite soit une session authentifiée, soit un rappel resolveUser lorsque requireSession est défini sur false",
		RESOLVED_USER_INVALID: "L'utilisateur résolu n'est pas valide",
	},
	hi: {
		CHALLENGE_NOT_FOUND: "चुनौती नहीं मिली",
		YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
			"आपको इस पासकी को पंजीकृत करने की अनुमति नहीं है",
		FAILED_TO_VERIFY_REGISTRATION: "पंजीकरण सत्यापित करने में विफल",
		PASSKEY_NOT_FOUND: "पासकी नहीं मिली",
		AUTHENTICATION_FAILED: "प्रमाणीकरण विफल",
		UNABLE_TO_CREATE_SESSION: "सत्र बनाने में असमर्थ",
		FAILED_TO_UPDATE_PASSKEY: "पासकी अपडेट करने में विफल",
		PREVIOUSLY_REGISTERED: "पहले से पंजीकृत",
		REGISTRATION_CANCELLED: "पंजीकरण रद्द कर दिया गया",
		AUTH_CANCELLED: "प्रमाणीकरण रद्द कर दिया गया",
		UNKNOWN_ERROR: "अज्ञात त्रुटि",
		SESSION_REQUIRED: "पासकी पंजीकरण के लिए एक प्रमाणित सत्र की आवश्यकता होती है",
		RESOLVE_USER_REQUIRED:
			"जब requireSession गलत हो तो पासकी पंजीकरण के लिए या तो एक प्रमाणित सत्र या resolveUser कॉलबैक की आवश्यकता होती है",
		RESOLVED_USER_INVALID: "समाधान किया गया उपयोगकर्ता अमान्य है",
	},
	id: {
		CHALLENGE_NOT_FOUND: "Tantangan tidak ditemukan",
		YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
			"Anda tidak diizinkan untuk mendaftarkan passkey ini",
		FAILED_TO_VERIFY_REGISTRATION: "Gagal memverifikasi pendaftaran",
		PASSKEY_NOT_FOUND: "Passkey tidak ditemukan",
		AUTHENTICATION_FAILED: "Autentikasi gagal",
		UNABLE_TO_CREATE_SESSION: "Tidak dapat membuat sesi",
		FAILED_TO_UPDATE_PASSKEY: "Gagal memperbarui passkey",
		PREVIOUSLY_REGISTERED: "Sebelumnya telah terdaftar",
		REGISTRATION_CANCELLED: "Pendaftaran dibatalkan",
		AUTH_CANCELLED: "Autentikasi dibatalkan",
		UNKNOWN_ERROR: "Kesalahan tidak dikenal",
		SESSION_REQUIRED: "Pendaftaran passkey memerlukan sesi terautentikasi",
		RESOLVE_USER_REQUIRED:
			"Pendaftaran passkey memerlukan sesi terautentikasi atau callback resolveUser ketika requireSession bernilai false",
		RESOLVED_USER_INVALID: "Pengguna yang diselesaikan tidak valid",
	},
	it: {
		CHALLENGE_NOT_FOUND: "Sfida non trovata",
		YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
			"Non sei autorizzato a registrare questa passkey",
		FAILED_TO_VERIFY_REGISTRATION: "Impossibile verificare la registrazione",
		PASSKEY_NOT_FOUND: "Passkey non trovata",
		AUTHENTICATION_FAILED: "Autenticazione fallita",
		UNABLE_TO_CREATE_SESSION: "Impossibile creare la sessione",
		FAILED_TO_UPDATE_PASSKEY: "Impossibile aggiornare la passkey",
		PREVIOUSLY_REGISTERED: "Registrata in precedenza",
		REGISTRATION_CANCELLED: "Registrazione annullata",
		AUTH_CANCELLED: "Autenticazione annullata",
		UNKNOWN_ERROR: "Errore sconosciuto",
		SESSION_REQUIRED:
			"La registrazione della passkey richiede una sessione autenticata",
		RESOLVE_USER_REQUIRED:
			"La registrazione della passkey richiede una sessione autenticata o una callback resolveUser quando requireSession è false",
		RESOLVED_USER_INVALID: "L'utente risolto non è valido",
	},
	ja: {
		CHALLENGE_NOT_FOUND: "チャレンジが見つかりません",
		YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
			"このパスキーの登録 is not allowed",
		FAILED_TO_VERIFY_REGISTRATION: "登録の検証に失敗しました",
		PASSKEY_NOT_FOUND: "パスキーが見つかりません",
		AUTHENTICATION_FAILED: "認証に失敗しました",
		UNABLE_TO_CREATE_SESSION: "セッションを作成できません",
		FAILED_TO_UPDATE_PASSKEY: "パスキーの更新に失敗しました",
		PREVIOUSLY_REGISTERED: "既に登録されています",
		REGISTRATION_CANCELLED: "登録がキャンセルされました",
		AUTH_CANCELLED: "認証がキャンセルされました",
		UNKNOWN_ERROR: "不明なエラーが発生しました",
		SESSION_REQUIRED: "パスキーの登録には認証されたセッションが必要です",
		RESOLVE_USER_REQUIRED:
			"requireSessionがfalseの場合、パスキーの登録には認証されたセッションまたはresolveUserコールバックのいずれかが必要です",
		RESOLVED_USER_INVALID: "解決されたユーザーが無効です",
	},
	ko: {
		CHALLENGE_NOT_FOUND: "챌린지를 찾을 수 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
			"이 패스키를 등록할 권한이 없습니다",
		FAILED_TO_VERIFY_REGISTRATION: "등록 확인에 실패했습니다",
		PASSKEY_NOT_FOUND: "패스키를 찾을 수 없습니다",
		AUTHENTICATION_FAILED: "인증에 실패했습니다",
		UNABLE_TO_CREATE_SESSION: "세션을 생성할 수 없습니다",
		FAILED_TO_UPDATE_PASSKEY: "패스키 업데이트에 실패했습니다",
		PREVIOUSLY_REGISTERED: "이미 등록되었습니다",
		REGISTRATION_CANCELLED: "등록이 취소되었습니다",
		AUTH_CANCELLED: "인증이 취소되었습니다",
		UNKNOWN_ERROR: "알 수 없는 오류가 발생했습니다",
		SESSION_REQUIRED: "패스키 등록을 위해서는 인증된 세션이 필요합니다",
		RESOLVE_USER_REQUIRED:
			"requireSession이 false일 때 패스키 등록을 하려면 인증된 세션 또는 resolveUser 콜백 중 하나가 필요합니다",
		RESOLVED_USER_INVALID: "확인된 사용자가 올바르지 않습니다",
	},
	nl: {
		CHALLENGE_NOT_FOUND: "Challenge niet gevonden",
		YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
			"U bent niet gemachtigd om deze passkey te registreren",
		FAILED_TO_VERIFY_REGISTRATION: "Registratieverificatie mislukt",
		PASSKEY_NOT_FOUND: "Passkey niet gevonden",
		AUTHENTICATION_FAILED: "Authenticatie mislukt",
		UNABLE_TO_CREATE_SESSION: "Kan sessie niet maken",
		FAILED_TO_UPDATE_PASSKEY: "Bijwerken passkey mislukt",
		PREVIOUSLY_REGISTERED: "Eerder geregistreerd",
		REGISTRATION_CANCELLED: "Registratie geannuleerd",
		AUTH_CANCELLED: "Authenticatie geannuleerd",
		UNKNOWN_ERROR: "Onbekende fout",
		SESSION_REQUIRED: "Passkey-registratie vereist een geauthenticeerde sessie",
		RESOLVE_USER_REQUIRED:
			"Passkey-registratie vereist een geauthenticeerde sessie of een resolveUser-callback wanneer requireSession false is",
		RESOLVED_USER_INVALID: "Opgeloste gebruiker is ongeldig",
	},
	pl: {
		CHALLENGE_NOT_FOUND: "Nie znaleziono wyzwania",
		YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
			"Nie masz uprawnień do zarejestrowania tego klucza dostępu",
		FAILED_TO_VERIFY_REGISTRATION: "Weryfikacja rejestracji nie powiodła się",
		PASSKEY_NOT_FOUND: "Nie znaleziono klucza dostępu",
		AUTHENTICATION_FAILED: "Uwierzytelnianie nie powiodło się",
		UNABLE_TO_CREATE_SESSION: "Nie można utworzyć sesji",
		FAILED_TO_UPDATE_PASSKEY: "Aktualizacja klucza dostępu nie powiodła się",
		PREVIOUSLY_REGISTERED: "Zarejestrowano wcześniej",
		REGISTRATION_CANCELLED: "Rejestracja anulowana",
		AUTH_CANCELLED: "Uwierzytelnianie anulowane",
		UNKNOWN_ERROR: "Nieznany błąd",
		SESSION_REQUIRED:
			"Rejestracja klucza dostępu wymaga uwierzytelnionej sesji",
		RESOLVE_USER_REQUIRED:
			"Rejestracja klucza dostępu wymaga uwierzytelnionej sesji lub funkcji wywołania zwrotnego resolveUser, gdy requireSession jest ustawione na false",
		RESOLVED_USER_INVALID: "Rozwiązany użytkownik jest nieprawidłowy",
	},
	pt: {
		CHALLENGE_NOT_FOUND: "Desafio não encontrado",
		YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
			"Você não tem permissão para registrar esta passkey",
		FAILED_TO_VERIFY_REGISTRATION: "Falha ao verificar o registro",
		PASSKEY_NOT_FOUND: "Passkey não encontrada",
		AUTHENTICATION_FAILED: "Falha na autenticação",
		UNABLE_TO_CREATE_SESSION: "Não foi possível criar a sessão",
		FAILED_TO_UPDATE_PASSKEY: "Falha ao atualizar a passkey",
		PREVIOUSLY_REGISTERED: "Registrado anteriormente",
		REGISTRATION_CANCELLED: "Registro cancelado",
		AUTH_CANCELLED: "Autenticação cancelada",
		UNKNOWN_ERROR: "Erro desconhecido",
		SESSION_REQUIRED: "O registro da passkey requer uma sessão autenticada",
		RESOLVE_USER_REQUIRED:
			"O registro da passkey requer uma sessão autenticada ou um callback resolveUser quando requireSession é falso",
		RESOLVED_USER_INVALID: "Usuário resolvido é inválido",
	},
	ru: {
		CHALLENGE_NOT_FOUND: "Вызов не найден",
		YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
			"Вам не разрешено регистрировать этот ключ доступа",
		FAILED_TO_VERIFY_REGISTRATION: "Не удалось проверить регистрацию",
		PASSKEY_NOT_FOUND: "Ключ доступа не найден",
		AUTHENTICATION_FAILED: "Ошибка аутентификации",
		UNABLE_TO_CREATE_SESSION: "Не удалось создать сессию",
		FAILED_TO_UPDATE_PASSKEY: "Не удалось обновить ключ доступа",
		PREVIOUSLY_REGISTERED: "Зарегистрирован ранее",
		REGISTRATION_CANCELLED: "Регистрация отменена",
		AUTH_CANCELLED: "Аутентификация отменена",
		UNKNOWN_ERROR: "Неизвестная ошибка",
		SESSION_REQUIRED:
			"Регистрация ключа доступа требует аутентифицированной сессии",
		RESOLVE_USER_REQUIRED:
			"Регистрация ключа доступа требует либо аутентифицированной сессии, либо обратного вызова resolveUser, если requireSession имеет значение false",
		RESOLVED_USER_INVALID: "Разрешенный пользователь недействителен",
	},
	sv: {
		CHALLENGE_NOT_FOUND: "Utmaning hittades inte",
		YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
			"Du har inte tillåtelse att registrera denna passnyckel",
		FAILED_TO_VERIFY_REGISTRATION:
			"Misslyckades med att verifiera registrering",
		PASSKEY_NOT_FOUND: "Passnyckel hittades inte",
		AUTHENTICATION_FAILED: "Autentisering misslyckades",
		UNABLE_TO_CREATE_SESSION: "Kunde inte skapa session",
		FAILED_TO_UPDATE_PASSKEY: "Misslyckades med att uppdatera passnyckel",
		PREVIOUSLY_REGISTERED: "Tidigare registrerad",
		REGISTRATION_CANCELLED: "Registrering avbruten",
		AUTH_CANCELLED: "Autentisering avbruten",
		UNKNOWN_ERROR: "Okänt fel",
		SESSION_REQUIRED:
			"Registrering av passnyckel kräver en autentiserad session",
		RESOLVE_USER_REQUIRED: "Utmaning hittades inte",
		RESOLVED_USER_INVALID: "Den identifierade användaren är ogiltig",
	},
	tr: {
		CHALLENGE_NOT_FOUND: "Doğrulama isteği bulunamadı",
		YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
			"Bu geçiş anahtarını kaydetmenize izin verilmiyor",
		FAILED_TO_VERIFY_REGISTRATION: "Kayıt doğrulanamadı",
		PASSKEY_NOT_FOUND: "Geçiş anahtarı bulunamadı",
		AUTHENTICATION_FAILED: "Kimlik doğrulama başarısız",
		UNABLE_TO_CREATE_SESSION: "Oturum oluşturulamadı",
		FAILED_TO_UPDATE_PASSKEY: "Geçiş anahtarı güncellenemedi",
		PREVIOUSLY_REGISTERED: "Daha önce kaydedilmiş",
		REGISTRATION_CANCELLED: "Kayıt iptal edildi",
		AUTH_CANCELLED: "Kimlik doğrulama iptal edildi",
		UNKNOWN_ERROR: "Bilinmeyen hata",
		SESSION_REQUIRED:
			"Geçiş anahtarı kaydı, kimliği doğrulanmış bir oturum gerektirir",
		RESOLVE_USER_REQUIRED:
			"Geçiş anahtarı kaydı, requireSession false olduğunda ya doğrulanmış bir oturum ya da bir resolveUser geri çağrısı gerektirir",
		RESOLVED_USER_INVALID: "Çözümlenen kullanıcı geçersiz",
	},
	uk: {
		CHALLENGE_NOT_FOUND: "Запит не знайдено",
		YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
			"Вам не дозволено реєструвати цей ключ доступу",
		FAILED_TO_VERIFY_REGISTRATION: "Не вдалося перевірити реєстрацію",
		PASSKEY_NOT_FOUND: "Ключ доступу не знайдено",
		AUTHENTICATION_FAILED: "Помилка автентифікації",
		UNABLE_TO_CREATE_SESSION: "Не вдалося створити сесію",
		FAILED_TO_UPDATE_PASSKEY: "Не вдалося оновити ключ доступу",
		PREVIOUSLY_REGISTERED: "Зареєстровано раніше",
		REGISTRATION_CANCELLED: "Реєстрацію скасовано",
		AUTH_CANCELLED: "Автентифікацію скасовано",
		UNKNOWN_ERROR: "Невідома помилка",
		SESSION_REQUIRED:
			"Реєстрація ключа доступу потребує автентифікованої сесії",
		RESOLVE_USER_REQUIRED:
			"Реєстрація ключа доступу потребує або автентифікованої сесії, або функції зворотного виклику resolveUser, якщо requireSession має значення false",
		RESOLVED_USER_INVALID: "Визначений користувач недійсний",
	},
	vi: {
		CHALLENGE_NOT_FOUND: "Không tìm thấy thử thách",
		YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
			"Bạn không được phép đăng ký passkey này",
		FAILED_TO_VERIFY_REGISTRATION: "Xác minh đăng ký thất bại",
		PASSKEY_NOT_FOUND: "Không tìm thấy passkey",
		AUTHENTICATION_FAILED: "Xác thực thất bại",
		UNABLE_TO_CREATE_SESSION: "Không thể tạo phiên",
		FAILED_TO_UPDATE_PASSKEY: "Cập nhật passkey thất bại",
		PREVIOUSLY_REGISTERED: "Đã đăng ký trước đó",
		REGISTRATION_CANCELLED: "Đã hủy đăng ký",
		AUTH_CANCELLED: "Đã hủy xác thực",
		UNKNOWN_ERROR: "Lỗi không xác định",
		SESSION_REQUIRED: "Đăng ký passkey yêu cầu một phiên đã được xác thực",
		RESOLVE_USER_REQUIRED:
			"Đăng ký passkey yêu cầu một phiên đã được xác thực hoặc một callback resolveUser khi requireSession là false",
		RESOLVED_USER_INVALID: "Người dùng được xác định không hợp lệ",
	},
	zh: {
		CHALLENGE_NOT_FOUND: "未找到挑战",
		YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: "您无权注册此通行密钥",
		FAILED_TO_VERIFY_REGISTRATION: "无法验证注册",
		PASSKEY_NOT_FOUND: "未找到通行密钥",
		AUTHENTICATION_FAILED: "身份验证失败",
		UNABLE_TO_CREATE_SESSION: "无法创建会话",
		FAILED_TO_UPDATE_PASSKEY: "更新通行密钥失败",
		PREVIOUSLY_REGISTERED: "此前已注册",
		REGISTRATION_CANCELLED: "注册已取消",
		AUTH_CANCELLED: "验证已取消",
		UNKNOWN_ERROR: "未知错误",
		SESSION_REQUIRED: "注册通行密钥需要已登录的会话",
		RESOLVE_USER_REQUIRED:
			"当 requireSession 为 false 时，注册通行密钥需要已登录 the session or resolveUser callback",
		RESOLVED_USER_INVALID: "解析的用户无效",
	},
	th: {
		CHALLENGE_NOT_FOUND: "ไม่พบคำขอท้าทาย",
		YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
			"คุณไม่ได้รับอนุญาตให้ลงทะเบียนพาสคีย์นี้",
		FAILED_TO_VERIFY_REGISTRATION: "การยืนยันการลงทะเบียนล้มเหลว",
		PASSKEY_NOT_FOUND: "ไม่พบพาสคีย์",
		AUTHENTICATION_FAILED: "การยืนยันตัวตนล้มเหลว",
		UNABLE_TO_CREATE_SESSION: "ไม่สามารถสร้างเซสชันได้",
		FAILED_TO_UPDATE_PASSKEY: "อัปเดตพาสคีย์ล้มเหลว",
		PREVIOUSLY_REGISTERED: "ลงทะเบียนไว้ก่อนหน้านี้แล้ว",
		REGISTRATION_CANCELLED: "การลงทะเบียนถูกยกเลิก",
		AUTH_CANCELLED: "การยืนยันตัวตนถูกยกเลิก",
		UNKNOWN_ERROR: "เกิดข้อผิดพลาดที่ไม่รู้จัก",
		SESSION_REQUIRED: "การลงทะเบียนพาสคีย์จำเป็นต้องมีเซสชันที่ได้รับการยืนยันตัวตนแล้ว",
		RESOLVE_USER_REQUIRED:
			"การลงทะเบียนพาสคีย์จำเป็นต้องมีเซสชันที่ยืนยันตัวตนแล้ว หรือมีคอลแบ็ก resolveUser เมื่อ requireSession เป็น false",
		RESOLVED_USER_INVALID: "ผู้ใช้ที่ระบุไม่ถูกต้อง",
	},
};
