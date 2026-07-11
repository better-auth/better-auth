import type { OAUTH_POPUP_ERROR_CODES } from "better-auth/plugins";
import type { PluginErrorTranslations } from "../../types";

export const oauthPopupTranslations: PluginErrorTranslations<
	typeof OAUTH_POPUP_ERROR_CODES
> = {
	ar: {
		POPUP_SIGN_IN_FAILED: "فشل تسجيل الدخول عبر النافذة المنبثقة",
		POPUP_BLOCKED: "تم حجب النافذة المنبثقة لتسجيل الدخول من قبل المتصفح",
		POPUP_CLOSED: "تم إغلاق النافذة المنبثقة لتسجيل الدخول قبل الاكتمال",
		POPUP_TIMEOUT: "انتهت مهلة النافذة المنبثقة لتسجيل الدخول",
	},
	bn: {
		POPUP_SIGN_IN_FAILED: "পপআপ সাইন-ইন ব্যর্থ হয়েছে",
		POPUP_BLOCKED: "সাইন-ইন পপআপ ব্রাউজার দ্বারা ব্লক করা হয়েছে",
		POPUP_CLOSED: "সাইন-ইন পপআপ সম্পূর্ণ হওয়ার আগে বন্ধ হয়ে গেছে",
		POPUP_TIMEOUT: "সাইন-ইন পপআপের সময় শেষ হয়ে গেছে",
	},
	de: {
		POPUP_SIGN_IN_FAILED: "Popup-Anmeldung fehlgeschlagen",
		POPUP_BLOCKED: "Das Anmelde-Popup wurde vom Browser blockiert",
		POPUP_CLOSED: "Das Anmelde-Popup wurde vor dem Abschluss geschlossen",
		POPUP_TIMEOUT: "Das Anmelde-Popup hat das Zeitlimit überschritten",
	},
	en: {
		POPUP_SIGN_IN_FAILED: "Popup sign-in failed",
		POPUP_BLOCKED: "Sign-in popup was blocked by the browser",
		POPUP_CLOSED: "Sign-in popup was closed before completing",
		POPUP_TIMEOUT: "Sign-in popup timed out",
	},
	es: {
		POPUP_SIGN_IN_FAILED: "El inicio de sesión emergente falló",
		POPUP_BLOCKED:
			"El navegador bloqueó la ventana emergente de inicio de sesión",
		POPUP_CLOSED:
			"La ventana emergente de inicio de sesión se cerró antes de completarse",
		POPUP_TIMEOUT:
			"La ventana emergente de inicio de sesión agotó el tiempo de espera",
	},
	fa: {
		POPUP_SIGN_IN_FAILED: "ورود از طریق پنجره پاپ‌آپ ناموفق بود",
		POPUP_BLOCKED: "پنجره پاپ‌آپ ورود توسط مرورگر مسدود شد",
		POPUP_CLOSED: "پنجره پاپ‌آپ ورود قبل از تکمیل بسته شد",
		POPUP_TIMEOUT: "پنجره پاپ‌آپ ورود منقضی شد",
	},
	fr: {
		POPUP_SIGN_IN_FAILED: "La connexion via la fenêtre contextuelle a échoué",
		POPUP_BLOCKED:
			"La fenêtre contextuelle de connexion a été bloquée par le navigateur",
		POPUP_CLOSED:
			"La fenêtre contextuelle de connexion a été fermée avant d'être complétée",
		POPUP_TIMEOUT: "La fenêtre contextuelle de connexion a expiré",
	},
	hi: {
		POPUP_SIGN_IN_FAILED: "पॉप-अप साइन-इन विफल हो गया",
		POPUP_BLOCKED: "साइन-इन पॉप-अप ब्राउज़र द्वारा ब्लॉक कर दिया गया",
		POPUP_CLOSED: "साइन-इन पॉप-अप पूरा होने से पहले बंद हो गया",
		POPUP_TIMEOUT: "साइन-इन पॉप-अप का समय समाप्त हो गया",
	},
	id: {
		POPUP_SIGN_IN_FAILED: "Masuk melalui popup gagal",
		POPUP_BLOCKED: "Popup masuk diblokir oleh browser",
		POPUP_CLOSED: "Popup masuk ditutup sebelum selesai",
		POPUP_TIMEOUT: "Popup masuk telah habis waktu",
	},
	it: {
		POPUP_SIGN_IN_FAILED: "Accesso tramite popup non riuscito",
		POPUP_BLOCKED: "Il popup di accesso è stato bloccato dal browser",
		POPUP_CLOSED: "Il popup di accesso è stato chiuso prima del completamento",
		POPUP_TIMEOUT: "Il popup di accesso è scaduto",
	},
	ja: {
		POPUP_SIGN_IN_FAILED: "ポップアップでのサインインに失敗しました",
		POPUP_BLOCKED: "サインインポップアップがブラウザによってブロックされました",
		POPUP_CLOSED: "サインインポップアップが完了前に閉じられました",
		POPUP_TIMEOUT: "サインインポップアップがタイムアウトしました",
	},
	ko: {
		POPUP_SIGN_IN_FAILED: "팝업 로그인에 실패했습니다",
		POPUP_BLOCKED: "로그인 팝업이 브라우저에 의해 차단되었습니다",
		POPUP_CLOSED: "로그인 팝업이 완료되기 전에 닫혔습니다",
		POPUP_TIMEOUT: "로그인 팝업 시간이 초과되었습니다",
	},
	nl: {
		POPUP_SIGN_IN_FAILED: "Inloggen via pop-up mislukt",
		POPUP_BLOCKED: "Het inlogpop-up werd geblokkeerd door de browser",
		POPUP_CLOSED: "Het inlogpop-up werd gesloten voordat het voltooid was",
		POPUP_TIMEOUT: "Het inlogpop-up is verlopen",
	},
	pl: {
		POPUP_SIGN_IN_FAILED: "Logowanie przez wyskakujące okno nie powiodło się",
		POPUP_BLOCKED:
			"Wyskakujące okno logowania zostało zablokowane przez przeglądarkę",
		POPUP_CLOSED:
			"Wyskakujące okno logowania zostało zamknięte przed ukończeniem",
		POPUP_TIMEOUT: "Wyskakujące okno logowania przekroczyło limit czasu",
	},
	pt: {
		POPUP_SIGN_IN_FAILED: "O login via popup falhou",
		POPUP_BLOCKED: "O popup de login foi bloqueado pelo navegador",
		POPUP_CLOSED: "O popup de login foi fechado antes de ser concluído",
		POPUP_TIMEOUT: "O popup de login expirou",
	},
	ru: {
		POPUP_SIGN_IN_FAILED: "Вход через всплывающее окно не удался",
		POPUP_BLOCKED: "Всплывающее окно входа было заблокировано браузером",
		POPUP_CLOSED: "Всплывающее окно входа было закрыто до завершения",
		POPUP_TIMEOUT: "Время ожидания всплывающего окна входа истекло",
	},
	sv: {
		POPUP_SIGN_IN_FAILED: "Popup-inloggning misslyckades",
		POPUP_BLOCKED: "Popup-inloggningsfönstret blockerades av webbläsaren",
		POPUP_CLOSED: "Popup-inloggningsfönstret stängdes innan det slutfördes",
		POPUP_TIMEOUT: "Popup-inloggningsfönstret tog för lång tid",
	},
	th: {
		POPUP_SIGN_IN_FAILED: "การเข้าสู่ระบบผ่านป๊อปอัปล้มเหลว",
		POPUP_BLOCKED: "ป๊อปอัปการเข้าสู่ระบบถูกบล็อกโดยเบราว์เซอร์",
		POPUP_CLOSED: "ป๊อปอัปการเข้าสู่ระบบถูกปิดก่อนดำเนินการเสร็จสิ้น",
		POPUP_TIMEOUT: "ป๊อปอัปการเข้าสู่ระบบหมดเวลา",
	},
	tr: {
		POPUP_SIGN_IN_FAILED: "Açılır pencere ile oturum açma başarısız oldu",
		POPUP_BLOCKED:
			"Oturum açma açılır penceresi tarayıcı tarafından engellendi",
		POPUP_CLOSED: "Oturum açma açılır penceresi tamamlanmadan kapatıldı",
		POPUP_TIMEOUT: "Oturum açma açılır penceresi zaman aşımına uğradı",
	},
	uk: {
		POPUP_SIGN_IN_FAILED: "Вхід через спливаюче вікно не вдався",
		POPUP_BLOCKED: "Спливаюче вікно входу було заблоковано браузером",
		POPUP_CLOSED: "Спливаюче вікно входу було закрито до завершення",
		POPUP_TIMEOUT: "Час очікування спливаючого вікна входу минув",
	},
	vi: {
		POPUP_SIGN_IN_FAILED: "Đăng nhập qua cửa sổ bật lên thất bại",
		POPUP_BLOCKED: "Cửa sổ bật lên đăng nhập bị trình duyệt chặn",
		POPUP_CLOSED: "Cửa sổ bật lên đăng nhập bị đóng trước khi hoàn thành",
		POPUP_TIMEOUT: "Cửa sổ bật lên đăng nhập đã hết thời gian chờ",
	},
	zh: {
		POPUP_SIGN_IN_FAILED: "弹出窗口登录失败",
		POPUP_BLOCKED: "登录弹出窗口被浏览器拦截",
		POPUP_CLOSED: "登录弹出窗口在完成前被关闭",
		POPUP_TIMEOUT: "登录弹出窗口已超时",
	},
};
