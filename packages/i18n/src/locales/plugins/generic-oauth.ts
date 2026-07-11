import type { GENERIC_OAUTH_ERROR_CODES } from "better-auth/plugins/generic-oauth";
import type { PluginErrorTranslations } from "../../types";

export const genericOAuthTranslations: PluginErrorTranslations<
	typeof GENERIC_OAUTH_ERROR_CODES
> = {
	ar: {
		INVALID_OAUTH_CONFIGURATION: "تكوين OAuth غير صالح",
		TOKEN_URL_NOT_FOUND:
			"تكوين OAuth غير صالح. عنوان URL للرمز المميز غير موجود.",
	},
	bn: {
		INVALID_OAUTH_CONFIGURATION: "অবৈধ OAuth কনফিগারেশন",
		TOKEN_URL_NOT_FOUND: "অবৈধ OAuth কনফিগারেশন। টোকেন URL পাওয়া যায়নি।",
	},
	de: {
		INVALID_OAUTH_CONFIGURATION: "Ungültige OAuth-Konfiguration",
		TOKEN_URL_NOT_FOUND:
			"Ungültige OAuth-Konfiguration. Token-URL nicht gefunden.",
	},
	en: {
		INVALID_OAUTH_CONFIGURATION: "Invalid OAuth configuration",
		TOKEN_URL_NOT_FOUND: "Invalid OAuth configuration. Token URL not found.",
	},
	es: {
		INVALID_OAUTH_CONFIGURATION: "Configuración OAuth no válida",
		TOKEN_URL_NOT_FOUND:
			"Configuración OAuth no válida. URL de token no encontrada.",
	},
	fa: {
		INVALID_OAUTH_CONFIGURATION: "پیکربندی OAuth نامعتبر است",
		TOKEN_URL_NOT_FOUND: "پیکربندی OAuth نامعتبر است. URL توکن یافت نشد.",
	},
	fr: {
		INVALID_OAUTH_CONFIGURATION: "Configuration OAuth invalide",
		TOKEN_URL_NOT_FOUND:
			"Configuration OAuth invalide. URL du token introuvable.",
	},
	hi: {
		INVALID_OAUTH_CONFIGURATION: "अमान्य OAuth कॉन्फ़िगरेशन",
		TOKEN_URL_NOT_FOUND: "अमान्य OAuth कॉन्फ़िगरेशन। टोकन URL नहीं मिला।",
	},
	id: {
		INVALID_OAUTH_CONFIGURATION: "Konfigurasi OAuth tidak valid",
		TOKEN_URL_NOT_FOUND:
			"Konfigurasi OAuth tidak valid. URL token tidak ditemukan.",
	},
	it: {
		INVALID_OAUTH_CONFIGURATION: "Configurazione OAuth non valida",
		TOKEN_URL_NOT_FOUND:
			"Configurazione OAuth non valida. URL del token non trovato.",
	},
	ja: {
		INVALID_OAUTH_CONFIGURATION: "OAuth設定が無効です",
		TOKEN_URL_NOT_FOUND: "OAuth設定が無効です。トークンURLが見つかりません。",
	},
	ko: {
		INVALID_OAUTH_CONFIGURATION: "유효하지 않은 OAuth 구성",
		TOKEN_URL_NOT_FOUND:
			"유효하지 않은 OAuth 구성. 토큰 URL을 찾을 수 없습니다.",
	},
	nl: {
		INVALID_OAUTH_CONFIGURATION: "Ongeldige OAuth-configuratie",
		TOKEN_URL_NOT_FOUND:
			"Ongeldige OAuth-configuratie. Token-URL niet gevonden.",
	},
	pl: {
		INVALID_OAUTH_CONFIGURATION: "Nieprawidłowa konfiguracja OAuth",
		TOKEN_URL_NOT_FOUND:
			"Nieprawidłowa konfiguracja OAuth. Nie znaleziono adresu URL tokenu.",
	},
	pt: {
		INVALID_OAUTH_CONFIGURATION: "Configuração OAuth inválida",
		TOKEN_URL_NOT_FOUND:
			"Configuração OAuth inválida. URL do token não encontrada.",
	},
	ru: {
		INVALID_OAUTH_CONFIGURATION: "Неверная конфигурация OAuth",
		TOKEN_URL_NOT_FOUND: "Неверная конфигурация OAuth. URL токена не найден.",
	},
	sv: {
		INVALID_OAUTH_CONFIGURATION: "Ogiltig OAuth-konfiguration",
		TOKEN_URL_NOT_FOUND:
			"Ogiltig OAuth-konfiguration. Token-URL hittades inte.",
	},
	th: {
		INVALID_OAUTH_CONFIGURATION: "การกำหนดค่า OAuth ไม่ถูกต้อง",
		TOKEN_URL_NOT_FOUND: "การกำหนดค่า OAuth ไม่ถูกต้อง ไม่พบ URL ของโทเค็น",
	},
	tr: {
		INVALID_OAUTH_CONFIGURATION: "Geçersiz OAuth yapılandırması",
		TOKEN_URL_NOT_FOUND:
			"Geçersiz OAuth yapılandırması. Token URL'si bulunamadı.",
	},
	uk: {
		INVALID_OAUTH_CONFIGURATION: "Неправильна конфігурація OAuth",
		TOKEN_URL_NOT_FOUND:
			"Неправильна конфігурація OAuth. URL токену не знайдено.",
	},
	vi: {
		INVALID_OAUTH_CONFIGURATION: "Cấu hình OAuth không hợp lệ",
		TOKEN_URL_NOT_FOUND:
			"Cấu hình OAuth không hợp lệ. Không tìm thấy URL token.",
	},
	zh: {
		INVALID_OAUTH_CONFIGURATION: "无效的 OAuth 配置",
		TOKEN_URL_NOT_FOUND: "无效的 OAuth 配置。未找到令牌 URL。",
	},
};
