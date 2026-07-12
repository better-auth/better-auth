import type { SAML_ERROR_CODES } from "@better-auth/sso";
import type { ErrorTranslations } from "../../types";

export const ssoTranslations: ErrorTranslations<typeof SAML_ERROR_CODES> = {
	ar: {
		SINGLE_LOGOUT_NOT_ENABLED: "تسجيل الخروج الموحد غير مفعل",
		INVALID_LOGOUT_RESPONSE: "استجابة تسجيل خروج غير صالحة",
		INVALID_LOGOUT_REQUEST: "طلب تسجيل خروج غير صالح",
		LOGOUT_FAILED_AT_IDP: "فشل تسجيل الخروج عند موفر الهوية (IdP)",
		IDP_SLO_NOT_SUPPORTED: "لا يدعم موفر الهوية (IdP) خدمة تسجيل الخروج الموحد",
		SAML_PROVIDER_NOT_FOUND: "موفر SAML غير موجود",
		CERT_SOURCE_MISSING:
			"يتطلب samlConfig إما شهادة توقيع (cert أو idpMetadata.cert) أو مستند XML لـ idpMetadata.metadata.",
	},
	bn: {
		SINGLE_LOGOUT_NOT_ENABLED: "সিঙ্গেল লগআউট সক্রিয় করা নেই",
		INVALID_LOGOUT_RESPONSE: "অবৈধ LogoutResponse",
		INVALID_LOGOUT_REQUEST: "অবৈধ LogoutRequest",
		LOGOUT_FAILED_AT_IDP: "IdP-তে লগআউট ব্যর্থ হয়েছে",
		IDP_SLO_NOT_SUPPORTED: "IdP সিঙ্গেল লগআউট সার্ভিস সমর্থন করে না",
		SAML_PROVIDER_NOT_FOUND: "SAML প্রোভাইডার পাওয়া যায়নি",
		CERT_SOURCE_MISSING:
			"samlConfig-এর জন্য একটি সাইনিং সার্টিফিকেট (cert বা idpMetadata.cert) অথবা একটি idpMetadata.metadata XML ডকুমেন্ট প্রয়োজন।",
	},
	de: {
		SINGLE_LOGOUT_NOT_ENABLED: "Single Logout ist nicht aktiviert",
		INVALID_LOGOUT_RESPONSE: "Ungültige Logout-Antwort (LogoutResponse)",
		INVALID_LOGOUT_REQUEST: "Ungültige Logout-Anfrage (LogoutRequest)",
		LOGOUT_FAILED_AT_IDP: "Logout beim IdP fehlgeschlagen",
		IDP_SLO_NOT_SUPPORTED: "Der IdP unterstützt den Single-Logout-Dienst nicht",
		SAML_PROVIDER_NOT_FOUND: "SAML-Anbieter nicht gefunden",
		CERT_SOURCE_MISSING:
			"samlConfig erfordert entweder ein Signaturzertifikat (cert oder idpMetadata.cert) oder ein idpMetadata.metadata XML-Dokument.",
	},
	en: {
		SINGLE_LOGOUT_NOT_ENABLED: "Single Logout is not enabled",
		INVALID_LOGOUT_RESPONSE: "Invalid LogoutResponse",
		INVALID_LOGOUT_REQUEST: "Invalid LogoutRequest",
		LOGOUT_FAILED_AT_IDP: "Logout failed at IdP",
		IDP_SLO_NOT_SUPPORTED: "IdP does not support Single Logout Service",
		SAML_PROVIDER_NOT_FOUND: "SAML provider not found",
		CERT_SOURCE_MISSING:
			"samlConfig requires either a signing certificate (cert or idpMetadata.cert) or an idpMetadata.metadata XML document.",
	},
	es: {
		SINGLE_LOGOUT_NOT_ENABLED:
			"El Cierre de Sesión Único (SLO) no está habilitado",
		INVALID_LOGOUT_RESPONSE: "LogoutResponse no válida",
		INVALID_LOGOUT_REQUEST: "LogoutRequest no válida",
		LOGOUT_FAILED_AT_IDP: "Error al cerrar sesión en el IdP",
		IDP_SLO_NOT_SUPPORTED:
			"El IdP no admite el Servicio de Cierre de Sesión Único",
		SAML_PROVIDER_NOT_FOUND: "Proveedor SAML no encontrado",
		CERT_SOURCE_MISSING:
			"samlConfig requiere un certificado de firma (cert o idpMetadata.cert) o un documento XML idpMetadata.metadata.",
	},
	fa: {
		SINGLE_LOGOUT_NOT_ENABLED: "خروج یکپارچه فعال نیست",
		INVALID_LOGOUT_RESPONSE: "LogoutResponse نامعتبر است",
		INVALID_LOGOUT_REQUEST: "LogoutRequest نامعتبر است",
		LOGOUT_FAILED_AT_IDP: "خروج در IdP با خطا مواجه شد",
		IDP_SLO_NOT_SUPPORTED:
			"موفر هویت (IdP) از سرویس خروج یکپارچه پشتیبانی نمی‌کند",
		SAML_PROVIDER_NOT_FOUND: "ارائه‌دهنده SAML یافت نشد",
		CERT_SOURCE_MISSING:
			"تنظیمات samlConfig به یک گواهی امضا (cert یا idpMetadata.cert) یا سند XML از نوع idpMetadata.metadata نیاز دارد.",
	},
	fr: {
		SINGLE_LOGOUT_NOT_ENABLED:
			"La déconnexion unique (Single Logout) n'est pas activée",
		INVALID_LOGOUT_RESPONSE: "LogoutResponse invalide",
		INVALID_LOGOUT_REQUEST: "LogoutRequest invalide",
		LOGOUT_FAILED_AT_IDP: "Échec de la déconnexion chez l'IdP",
		IDP_SLO_NOT_SUPPORTED:
			"L'IdP ne prend pas en charge le service de déconnexion unique",
		SAML_PROVIDER_NOT_FOUND: "Fournisseur SAML non trouvé",
		CERT_SOURCE_MISSING:
			"samlConfig nécessite soit un certificat de signature (cert ou idpMetadata.cert), soit un document XML idpMetadata.metadata.",
	},
	hi: {
		SINGLE_LOGOUT_NOT_ENABLED: "सिंगल लॉगआउट सक्षम नहीं है",
		INVALID_LOGOUT_RESPONSE: "अमान्य लॉगआउट रिस्पॉन्स (LogoutResponse)",
		INVALID_LOGOUT_REQUEST: "अमान्य लॉगआउट रिक्वेस्ट (LogoutRequest)",
		LOGOUT_FAILED_AT_IDP: "IdP पर लॉगआउट विफल रहा",
		IDP_SLO_NOT_SUPPORTED: "IdP सिंगल लॉगआउट सेवा का समर्थन नहीं करता है",
		SAML_PROVIDER_NOT_FOUND: "SAML प्रदाता नहीं मिला",
		CERT_SOURCE_MISSING:
			"samlConfig के लिए हस्ताक्षर प्रमाणपत्र (cert या idpMetadata.cert) या idpMetadata.metadata XML दस्तावेज़ की आवश्यकता होती है।",
	},
	id: {
		SINGLE_LOGOUT_NOT_ENABLED: "Single Logout tidak diaktifkan",
		INVALID_LOGOUT_RESPONSE: "LogoutResponse tidak valid",
		INVALID_LOGOUT_REQUEST: "LogoutRequest tidak valid",
		LOGOUT_FAILED_AT_IDP: "Logout gagal di IdP",
		IDP_SLO_NOT_SUPPORTED: "IdP tidak mendukung Layanan Single Logout",
		SAML_PROVIDER_NOT_FOUND: "Penyedia SAML tidak ditemukan",
		CERT_SOURCE_MISSING:
			"samlConfig memerlukan sertifikat penandatanganan (cert atau idpMetadata.cert) atau dokumen XML idpMetadata.metadata.",
	},
	it: {
		SINGLE_LOGOUT_NOT_ENABLED: "Il Single Logout non è abilitato",
		INVALID_LOGOUT_RESPONSE: "LogoutResponse non valida",
		INVALID_LOGOUT_REQUEST: "LogoutRequest non valida",
		LOGOUT_FAILED_AT_IDP: "Disconnessione non riuscita presso l'IdP",
		IDP_SLO_NOT_SUPPORTED: "L'IdP non supporta il servizio di Single Logout",
		SAML_PROVIDER_NOT_FOUND: "Fornitore SAML non trovato",
		CERT_SOURCE_MISSING:
			"samlConfig richiede un certificato di firma (cert o idpMetadata.cert) o un documento XML idpMetadata.metadata.",
	},
	ja: {
		SINGLE_LOGOUT_NOT_ENABLED:
			"シングルログアウト（SLO）が有効になっていません",
		INVALID_LOGOUT_RESPONSE: "無効なLogoutResponseです",
		INVALID_LOGOUT_REQUEST: "無効なLogoutRequestです",
		LOGOUT_FAILED_AT_IDP: "IdPでのログアウトに失敗しました",
		IDP_SLO_NOT_SUPPORTED:
			"IdPはシングルログアウトサービスをサポートしていません",
		SAML_PROVIDER_NOT_FOUND: "SAMLプロバイダーが見つかりません",
		CERT_SOURCE_MISSING:
			"samlConfigには署名証明書（certまたはidpMetadata.cert）か、idpMetadata.metadata XMLドキュメントのいずれかが必要です。",
	},
	ko: {
		SINGLE_LOGOUT_NOT_ENABLED: "싱글 로그아웃(SLO)이 활성화되어 있지 않습니다",
		INVALID_LOGOUT_RESPONSE:
			"올바르지 않은 로그아웃 응답(LogoutResponse)입니다",
		INVALID_LOGOUT_REQUEST: "올바르지 않은 로그아웃 요청(LogoutRequest)입니다",
		LOGOUT_FAILED_AT_IDP: "IdP에서 로그아웃에 실패했습니다",
		IDP_SLO_NOT_SUPPORTED: "IdP가 싱글 로그아웃 서비스를 지원하지 않습니다",
		SAML_PROVIDER_NOT_FOUND: "SAML 프로바이더를 찾을 수 없습니다",
		CERT_SOURCE_MISSING:
			"samlConfig 설정을 위해서는 서명 인증서(cert 또는 idpMetadata.cert)나 idpMetadata.metadata XML 문서가 필요합니다.",
	},
	nl: {
		SINGLE_LOGOUT_NOT_ENABLED: "Single Logout is niet ingeschakeld",
		INVALID_LOGOUT_RESPONSE: "Ongeldige LogoutResponse",
		INVALID_LOGOUT_REQUEST: "Ongeldige LogoutRequest",
		LOGOUT_FAILED_AT_IDP: "Afmelden mislukt bij IdP",
		IDP_SLO_NOT_SUPPORTED: "IdP ondersteunt Single Logout-service niet",
		SAML_PROVIDER_NOT_FOUND: "SAML-provider niet gevonden",
		CERT_SOURCE_MISSING:
			"samlConfig vereist een ondertekeningscertificaat (cert of idpMetadata.cert) of een idpMetadata.metadata XML-document.",
	},
	pl: {
		SINGLE_LOGOUT_NOT_ENABLED:
			"Jednokrotne wylogowanie (Single Logout) nie jest włączone",
		INVALID_LOGOUT_RESPONSE:
			"Nieprawidłowa odpowiedź wylogowania (LogoutResponse)",
		INVALID_LOGOUT_REQUEST: "Nieprawidłowe żądanie wylogowania (LogoutRequest)",
		LOGOUT_FAILED_AT_IDP:
			"Wylogowanie u dostawcy tożsamości (IdP) nie powiodło się",
		IDP_SLO_NOT_SUPPORTED:
			"Dostawca tożsamości (IdP) nie obsługuje usługi Single Logout",
		SAML_PROVIDER_NOT_FOUND: "Nie znaleziono dostawcy SAML",
		CERT_SOURCE_MISSING:
			"samlConfig wymaga certyfikatu podpisywania (cert lub idpMetadata.cert) albo dokumentu XML idpMetadata.metadata.",
	},
	pt: {
		SINGLE_LOGOUT_NOT_ENABLED: "Single Logout não está ativado",
		INVALID_LOGOUT_RESPONSE: "LogoutResponse inválida",
		INVALID_LOGOUT_REQUEST: "LogoutRequest inválida",
		LOGOUT_FAILED_AT_IDP: "Falha ao efetuar logout no IdP",
		IDP_SLO_NOT_SUPPORTED: "O IdP não suporta o serviço de Single Logout",
		SAML_PROVIDER_NOT_FOUND: "Provedor SAML não encontrado",
		CERT_SOURCE_MISSING:
			"samlConfig exige um certificado de assinatura (cert ou idpMetadata.cert) ou um documento XML idpMetadata.metadata.",
	},
	ru: {
		SINGLE_LOGOUT_NOT_ENABLED: "Единый выход (Single Logout) не включен",
		INVALID_LOGOUT_RESPONSE: "Неверный ответ о выходе (LogoutResponse)",
		INVALID_LOGOUT_REQUEST: "Неверный запрос о выходе (LogoutRequest)",
		LOGOUT_FAILED_AT_IDP: "Ошибка выхода на стороне IdP",
		IDP_SLO_NOT_SUPPORTED:
			"IdP не поддерживает службу единого выхода (Single Logout)",
		SAML_PROVIDER_NOT_FOUND: "SAML-провайдер не найден",
		CERT_SOURCE_MISSING:
			"samlConfig требует наличия сертификата подписи (cert или idpMetadata.cert) либо XML-документа idpMetadata.metadata.",
	},
	sv: {
		SINGLE_LOGOUT_NOT_ENABLED: "Single Logout är inte aktiverat",
		INVALID_LOGOUT_RESPONSE: "Ogiltigt LogoutResponse",
		INVALID_LOGOUT_REQUEST: "Ogiltigt LogoutRequest",
		LOGOUT_FAILED_AT_IDP: "Utloggning misslyckades hos IdP",
		IDP_SLO_NOT_SUPPORTED: "IdP stöder inte tjänsten Single Logout",
		SAML_PROVIDER_NOT_FOUND: "SAML-leverantör hittades inte",
		CERT_SOURCE_MISSING:
			"samlConfig kräver antingen ett signeringscertifikat (cert eller idpMetadata.cert) eller ett idpMetadata.metadata XML-dokument.",
	},
	tr: {
		SINGLE_LOGOUT_NOT_ENABLED: "Tekli Oturum Kapatma etkinleştirilmemiş",
		INVALID_LOGOUT_RESPONSE: "Geçersiz LogoutResponse",
		INVALID_LOGOUT_REQUEST: "Geçersiz LogoutRequest",
		LOGOUT_FAILED_AT_IDP: "Kimlik Sağlayıcıda (IdP) oturum kapatılamadı",
		IDP_SLO_NOT_SUPPORTED:
			"Kimlik Sağlayıcı (IdP) Tekli Oturum Kapatma Hizmetini desteklemiyor",
		SAML_PROVIDER_NOT_FOUND: "SAML sağlayıcısı bulunamadı",
		CERT_SOURCE_MISSING:
			"samlConfig imzalama sertifikası (cert veya idpMetadata.cert) veya idpMetadata.metadata XML belgesi gerektirir.",
	},
	uk: {
		SINGLE_LOGOUT_NOT_ENABLED: "Єдиний вихід (Single Logout) не увімкнено",
		INVALID_LOGOUT_RESPONSE: "Некоректна відповідь про вихід (LogoutResponse)",
		INVALID_LOGOUT_REQUEST: "Некоректний запит про вихід (LogoutRequest)",
		LOGOUT_FAILED_AT_IDP: "Помилка виходу на стороні IdP",
		IDP_SLO_NOT_SUPPORTED:
			"IdP не підтримує службу єдиного виходу (Single Logout)",
		SAML_PROVIDER_NOT_FOUND: "SAML-провайдер не знайдено",
		CERT_SOURCE_MISSING:
			"samlConfig вимагає наявності сертифіката підпису (cert або idpMetadata.cert) або XML-документа idpMetadata.metadata.",
	},
	vi: {
		SINGLE_LOGOUT_NOT_ENABLED:
			"Đăng xuất một lần (Single Logout) chưa được kích hoạt",
		INVALID_LOGOUT_RESPONSE: "LogoutResponse không hợp lệ",
		INVALID_LOGOUT_REQUEST: "LogoutRequest không hợp lệ",
		LOGOUT_FAILED_AT_IDP: "Đăng xuất thất bại tại IdP",
		IDP_SLO_NOT_SUPPORTED: "IdP không hỗ trợ dịch vụ Đăng xuất một lần",
		SAML_PROVIDER_NOT_FOUND: "Không tìm thấy nhà cung cấp SAML",
		CERT_SOURCE_MISSING:
			"samlConfig yêu cầu chứng chỉ ký (cert hoặc idpMetadata.cert) hoặc tài liệu XML idpMetadata.metadata.",
	},
	zh: {
		SINGLE_LOGOUT_NOT_ENABLED: "单点登出（Single Logout）未启用",
		INVALID_LOGOUT_RESPONSE: "无效的 LogoutResponse",
		INVALID_LOGOUT_REQUEST: "无效的 LogoutRequest",
		LOGOUT_FAILED_AT_IDP: "在身份提供商（IdP）处登出失败",
		IDP_SLO_NOT_SUPPORTED: "身份提供商（IdP）不支持单点登出服务",
		SAML_PROVIDER_NOT_FOUND: "未找到 SAML 提供商",
		CERT_SOURCE_MISSING:
			"samlConfig 需要签名证书（cert 或 idpMetadata.cert）或 idpMetadata.metadata XML 文档。",
	},
	th: {
		SINGLE_LOGOUT_NOT_ENABLED:
			"ไม่ได้เปิดใช้งานระบบออกจากระบบครั้งเดียว (Single Logout)",
		INVALID_LOGOUT_RESPONSE: "LogoutResponse ไม่ถูกต้อง",
		INVALID_LOGOUT_REQUEST: "LogoutRequest ไม่ถูกต้อง",
		LOGOUT_FAILED_AT_IDP: "ออกจากระบบล้มเหลวที่ผู้ให้บริการยืนยันตัวตน (IdP)",
		IDP_SLO_NOT_SUPPORTED: "IdP ไม่สนับสนุนบริการออกจากระบบครั้งเดียว",
		SAML_PROVIDER_NOT_FOUND: "ไม่พบผู้ให้บริการ SAML",
		CERT_SOURCE_MISSING:
			"samlConfig จำเป็นต้องระบุใบรับรองการลงนาม (cert หรือ idpMetadata.cert) หรือเอกสาร XML idpMetadata.metadata",
	},
};
