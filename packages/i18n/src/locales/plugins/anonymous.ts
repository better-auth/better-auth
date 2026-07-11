import type { ANONYMOUS_ERROR_CODES } from "better-auth/plugins/anonymous";
import type { PluginErrorTranslations } from "../../types";

export const anonymousTranslations: PluginErrorTranslations<
	typeof ANONYMOUS_ERROR_CODES
> = {
	ar: {
		INVALID_EMAIL_FORMAT: "لم يتم إنشاء البريد الإلكتروني بتنسيق صالح",
		FAILED_TO_CREATE_USER: "فشل في إنشاء المستخدم",
		COULD_NOT_CREATE_SESSION: "تعذر إنشاء الجلسة",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"لا يمكن للمستخدمين المجهولين تسجيل الدخول بشكل مجهول مرة أخرى",
		FAILED_TO_DELETE_ANONYMOUS_USER: "فشل حذف المستخدم المجهول",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS: "فشل حذف جلسات المستخدم المجهول",
		USER_IS_NOT_ANONYMOUS: "المستخدم ليس مجهول الهوية",
		DELETE_ANONYMOUS_USER_DISABLED: "حذف المستخدمين المجهولين معطل",
	},
	bn: {
		INVALID_EMAIL_FORMAT: "ইমেল একটি বৈধ বিন্যাসে তৈরি করা হয়নি",
		FAILED_TO_CREATE_USER: "ব্যবহারকারী তৈরি করতে ব্যর্থ",
		COULD_NOT_CREATE_SESSION: "সেশন তৈরি করা যায়নি",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"বেনামী ব্যবহারকারীরা আবার বেনামে সাইন ইন করতে পারবেন না",
		FAILED_TO_DELETE_ANONYMOUS_USER: "বেনামী ব্যবহারকারী মুছে ফেলতে ব্যর্থ",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"বেনামী ব্যবহারকারীর সেশন মুছে ফেলতে ব্যর্থ",
		USER_IS_NOT_ANONYMOUS: "ব্যবহারকারী বেনামী নন",
		DELETE_ANONYMOUS_USER_DISABLED: "বেনামী ব্যবহারকারী মুছে ফেলা নিষ্ক্রিয় করা আছে",
	},
	de: {
		INVALID_EMAIL_FORMAT:
			"E-Mail wurde nicht in einem gültigen Format generiert",
		FAILED_TO_CREATE_USER: "Benutzer konnte nicht erstellt werden",
		COULD_NOT_CREATE_SESSION: "Sitzung konnte nicht erstellt werden",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Anonyme Benutzer können sich nicht erneut anonym anmelden",
		FAILED_TO_DELETE_ANONYMOUS_USER:
			"Anonymer Benutzer konnte nicht gelöscht werden",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Sitzungen des anonymen Benutzers konnten nicht gelöscht werden",
		USER_IS_NOT_ANONYMOUS: "Benutzer ist nicht anonym",
		DELETE_ANONYMOUS_USER_DISABLED:
			"Das Löschen anonymer Benutzer ist deaktiviert",
	},
	en: {
		INVALID_EMAIL_FORMAT: "Email was not generated in a valid format",
		FAILED_TO_CREATE_USER: "Failed to create user",
		COULD_NOT_CREATE_SESSION: "Could not create session",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Anonymous users cannot sign in again anonymously",
		FAILED_TO_DELETE_ANONYMOUS_USER: "Failed to delete anonymous user",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Failed to delete anonymous user sessions",
		USER_IS_NOT_ANONYMOUS: "User is not anonymous",
		DELETE_ANONYMOUS_USER_DISABLED: "Deleting anonymous users is disabled",
	},
	es: {
		INVALID_EMAIL_FORMAT:
			"El correo electrónico no fue generado en un formato válido",
		FAILED_TO_CREATE_USER: "Error al crear el usuario",
		COULD_NOT_CREATE_SESSION: "No se pudo crear la sesión",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Los usuarios anónimos no pueden volver a iniciar sesión de forma anónima",
		FAILED_TO_DELETE_ANONYMOUS_USER: "Error al eliminar el usuario anónimo",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Error al eliminar las sesiones del usuario anónimo",
		USER_IS_NOT_ANONYMOUS: "El usuario no es anónimo",
		DELETE_ANONYMOUS_USER_DISABLED:
			"La eliminación de usuarios anónimos está desactivada",
	},
	fa: {
		INVALID_EMAIL_FORMAT: "ایمیل در قالب معتبری ایجاد نشده است",
		FAILED_TO_CREATE_USER: "خطا در ایجاد کاربر",
		COULD_NOT_CREATE_SESSION: "امکان ایجاد جلسه وجود نداشت",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"کاربران ناشناس نمی‌توانند دوباره به صورت ناشناس وارد شوند",
		FAILED_TO_DELETE_ANONYMOUS_USER: "خطا در حذف کاربر ناشناس",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS: "خطا در حذف جلسات کاربر ناشناس",
		USER_IS_NOT_ANONYMOUS: "کاربر ناشناس نیست",
		DELETE_ANONYMOUS_USER_DISABLED: "حذف کاربران ناشناس غیرفعال است",
	},
	fr: {
		INVALID_EMAIL_FORMAT: "L'e-mail n'a pas été généré dans un format valide",
		FAILED_TO_CREATE_USER: "Échec de la création de l'utilisateur",
		COULD_NOT_CREATE_SESSION: "Impossible de créer la session",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Les utilisateurs anonymes ne peuvent pas se reconnecter anonymement",
		FAILED_TO_DELETE_ANONYMOUS_USER:
			"Échec de la suppression de l'utilisateur anonyme",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Échec de la suppression des sessions de l'utilisateur anonyme",
		USER_IS_NOT_ANONYMOUS: "L'utilisateur n'est pas anonyme",
		DELETE_ANONYMOUS_USER_DISABLED:
			"La suppression des utilisateurs anonymes est désactivée",
	},
	hi: {
		INVALID_EMAIL_FORMAT: "ईमेल वैध प्रारूप में जनरेट नहीं किया गया था",
		FAILED_TO_CREATE_USER: "उपयोगकर्ता बनाने में विफल",
		COULD_NOT_CREATE_SESSION: "सत्र नहीं बनाया जा सका",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"अनाम उपयोगकर्ता फिर से गुमनाम रूप से साइन इन नहीं कर सकते",
		FAILED_TO_DELETE_ANONYMOUS_USER: "अनाम उपयोगकर्ता को हटाने में विफल",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"अनाम उपयोगकर्ता सत्रों को हटाने में विफल",
		USER_IS_NOT_ANONYMOUS: "उपयोगकर्ता अनाम नहीं है",
		DELETE_ANONYMOUS_USER_DISABLED: "अनाम उपयोगकर्ताओं को हटाना अक्षम है",
	},
	id: {
		INVALID_EMAIL_FORMAT: "Email tidak dibuat dalam format yang valid",
		FAILED_TO_CREATE_USER: "Gagal membuat pengguna",
		COULD_NOT_CREATE_SESSION: "Tidak dapat membuat sesi",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Pengguna anonim tidak dapat masuk secara anonim lagi",
		FAILED_TO_DELETE_ANONYMOUS_USER: "Gagal menghapus pengguna anonim",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Gagal menghapus sesi pengguna anonim",
		USER_IS_NOT_ANONYMOUS: "Pengguna bukan anonim",
		DELETE_ANONYMOUS_USER_DISABLED: "Penghapusan pengguna anonim dinonaktifkan",
	},
	it: {
		INVALID_EMAIL_FORMAT: "L'e-mail non è stata generata in un formato valido",
		FAILED_TO_CREATE_USER: "Impossibile creare l'utente",
		COULD_NOT_CREATE_SESSION: "Impossibile creare la sessione",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Gli utenti anonimi non possono accedere nuovamente in modo anonimo",
		FAILED_TO_DELETE_ANONYMOUS_USER: "Impossibile eliminare l'utente anonimo",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Impossibile eliminare le sessioni dell'utente anonimo",
		USER_IS_NOT_ANONYMOUS: "L'utente non è anonimo",
		DELETE_ANONYMOUS_USER_DISABLED:
			"L'eliminazione degli utenti anonimi è disabilitata",
	},
	ja: {
		INVALID_EMAIL_FORMAT: "メールアドレスが有効な形式で生成されませんでした",
		FAILED_TO_CREATE_USER: "ユーザーの作成に失敗しました",
		COULD_NOT_CREATE_SESSION: "セッションを作成できませんでした",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"匿名ユーザーは再度匿名でサインインすることはできません",
		FAILED_TO_DELETE_ANONYMOUS_USER: "匿名ユーザーの削除に失敗しました",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"匿名ユーザーのセッションの削除に失敗しました",
		USER_IS_NOT_ANONYMOUS: "ユーザーは匿名ではありません",
		DELETE_ANONYMOUS_USER_DISABLED: "匿名ユーザーの削除は無効になっています",
	},
	ko: {
		INVALID_EMAIL_FORMAT: "이메일이 유효한 형식으로 생성되지 않았습니다",
		FAILED_TO_CREATE_USER: "사용자 생성에 실패했습니다",
		COULD_NOT_CREATE_SESSION: "세션을 생성할 수 없습니다",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"익명 사용자는 다시 익명으로 로그인할 수 없습니다",
		FAILED_TO_DELETE_ANONYMOUS_USER: "익명 사용자 삭제에 실패했습니다",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"익명 사용자 세션 삭제에 실패했습니다",
		USER_IS_NOT_ANONYMOUS: "익명 사용자가 아닙니다",
		DELETE_ANONYMOUS_USER_DISABLED: "익명 사용자 삭제가 비활성화되었습니다",
	},
	nl: {
		INVALID_EMAIL_FORMAT: "E-mail is niet in een geldig formaat gegenereerd",
		FAILED_TO_CREATE_USER: "Mislukt om gebruiker aan te maken",
		COULD_NOT_CREATE_SESSION: "Kon sessie niet maken",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Anonieme gebruikers kunnen niet opnieuw anoniem inloggen",
		FAILED_TO_DELETE_ANONYMOUS_USER:
			"Mislukt om anonieme gebruiker te verwijderen",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Mislukt om sessies van anonieme gebruiker te verwijderen",
		USER_IS_NOT_ANONYMOUS: "Gebruiker is niet anoniem",
		DELETE_ANONYMOUS_USER_DISABLED:
			"Verwijderen van anonieme gebruikers is uitgeschakeld",
	},
	pl: {
		INVALID_EMAIL_FORMAT:
			"E-mail nie został wygenerowany w prawidłowym formacie",
		FAILED_TO_CREATE_USER: "Nie udało się utworzyć użytkownika",
		COULD_NOT_CREATE_SESSION: "Nie udało się utworzyć sesji",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Użytkownicy anonimowi nie mogą ponownie zalogować się anonimowo",
		FAILED_TO_DELETE_ANONYMOUS_USER:
			"Nie udało się usunąć anonimowego użytkownika",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Nie udało się usunąć sesji anonimowego użytkownika",
		USER_IS_NOT_ANONYMOUS: "Użytkownik nie jest anonimowy",
		DELETE_ANONYMOUS_USER_DISABLED:
			"Usuwanie anonimowych użytkowników jest wyłączone",
	},
	pt: {
		INVALID_EMAIL_FORMAT: "E-mail não foi gerado em um formato válido",
		FAILED_TO_CREATE_USER: "Falha ao criar usuário",
		COULD_NOT_CREATE_SESSION: "Não foi possível criar a sessão",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Usuários anônimos não podem entrar anonimamente novamente",
		FAILED_TO_DELETE_ANONYMOUS_USER: "Falha ao excluir usuário anônimo",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Falha ao excluir sessões de usuário anônimo",
		USER_IS_NOT_ANONYMOUS: "O usuário não é anônimo",
		DELETE_ANONYMOUS_USER_DISABLED:
			"A exclusão de usuários anônimos está desativada",
	},
	ru: {
		INVALID_EMAIL_FORMAT: "Email был создан в неверном формате",
		FAILED_TO_CREATE_USER: "Не удалось создать пользователя",
		COULD_NOT_CREATE_SESSION: "Не удалось создать сессию",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Анонимные пользователи не могут войти анонимно снова",
		FAILED_TO_DELETE_ANONYMOUS_USER:
			"Не удалось удалить анонимного пользователя",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Не удалось удалить сессии анонимного пользователя",
		USER_IS_NOT_ANONYMOUS: "Пользователь не анонимный",
		DELETE_ANONYMOUS_USER_DISABLED:
			"Удаление анонимных пользователей отключено",
	},
	sv: {
		INVALID_EMAIL_FORMAT: "E-postadressen skapades inte i ett giltigt format",
		FAILED_TO_CREATE_USER: "Det gick inte att skapa användare",
		COULD_NOT_CREATE_SESSION: "Det gick inte att skapa session",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Anonyma användare kan inte logga in anonymt igen",
		FAILED_TO_DELETE_ANONYMOUS_USER:
			"Det gick inte att ta bort anonym användare",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Det gick inte att ta bort sessioner för anonym användare",
		USER_IS_NOT_ANONYMOUS: "Användaren är inte anonym",
		DELETE_ANONYMOUS_USER_DISABLED:
			"Borttagning av anonyma användare är inaktiverad",
	},
	th: {
		INVALID_EMAIL_FORMAT: "อีเมลไม่ได้สร้างขึ้นในรูปแบบที่ถูกต้อง",
		FAILED_TO_CREATE_USER: "สร้างผู้ใช้ไม่สำเร็จ",
		COULD_NOT_CREATE_SESSION: "ไม่สามารถสร้างเซสชันได้",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"ผู้ใช้นิรนามไม่สามารถลงชื่อเข้าใช้อย่างนิรนามได้อีกครั้ง",
		FAILED_TO_DELETE_ANONYMOUS_USER: "ลบผู้ใช้นิรนามไม่สำเร็จ",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS: "ลบเซสชันของผู้ใช้นิรนามไม่สำเร็จ",
		USER_IS_NOT_ANONYMOUS: "ผู้ใช้ไม่ได้เป็นนิรนาม",
		DELETE_ANONYMOUS_USER_DISABLED: "การลบผู้ใช้นิรนามถูกปิดใช้งาน",
	},
	tr: {
		INVALID_EMAIL_FORMAT: "E-posta geçerli bir biçimde oluşturulmadı",
		FAILED_TO_CREATE_USER: "Kullanıcı oluşturulamadı",
		COULD_NOT_CREATE_SESSION: "Oturum oluşturulamadı",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Anonim kullanıcılar tekrar anonim olarak giriş yapamazlar",
		FAILED_TO_DELETE_ANONYMOUS_USER: "Anonim kullanıcı silinemedi",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Anonim kullanıcı oturumları silinemedi",
		USER_IS_NOT_ANONYMOUS: "Kullanıcı anonim değil",
		DELETE_ANONYMOUS_USER_DISABLED:
			"Anonim kullanıcıların silinmesi devre dışı bırakıldı",
	},
	uk: {
		INVALID_EMAIL_FORMAT: "Електронна пошта була створена в недійсному форматі",
		FAILED_TO_CREATE_USER: "Не вдалося створити користувача",
		COULD_NOT_CREATE_SESSION: "Не вдалося створити сесію",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Анонімні користувачі не можуть увійти анонімно знову",
		FAILED_TO_DELETE_ANONYMOUS_USER:
			"Не вдалося видалити анонімного користувача",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Не вдалося видалити сесії анонімного користувача",
		USER_IS_NOT_ANONYMOUS: "Користувач не анонімний",
		DELETE_ANONYMOUS_USER_DISABLED: "Видалення анонімних користувачів вимкнено",
	},
	vi: {
		INVALID_EMAIL_FORMAT: "Email không được tạo ở định dạng hợp lệ",
		FAILED_TO_CREATE_USER: "Tạo người dùng thất bại",
		COULD_NOT_CREATE_SESSION: "Không thể tạo phiên làm việc",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Người dùng ẩn danh không thể đăng nhập ẩn danh lại",
		FAILED_TO_DELETE_ANONYMOUS_USER: "Xóa người dùng ẩn danh thất bại",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Xóa phiên làm việc của người dùng ẩn danh thất bại",
		USER_IS_NOT_ANONYMOUS: "Người dùng không ẩn danh",
		DELETE_ANONYMOUS_USER_DISABLED:
			"Tính năng xóa người dùng ẩn danh bị vô hiệu hóa",
	},
	zh: {
		INVALID_EMAIL_FORMAT: "Email was not generated in a valid format",
		FAILED_TO_CREATE_USER: "Failed to create user",
		COULD_NOT_CREATE_SESSION: "Could not create session",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Anonymous users cannot sign in again anonymously",
		FAILED_TO_DELETE_ANONYMOUS_USER: "Failed to delete anonymous user",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Failed to delete anonymous user sessions",
		USER_IS_NOT_ANONYMOUS: "User is not anonymous",
		DELETE_ANONYMOUS_USER_DISABLED: "Deleting anonymous users is disabled",
	},
};
