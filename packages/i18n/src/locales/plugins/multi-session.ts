import type { MULTI_SESSION_ERROR_CODES } from "better-auth/plugins/multi-session";
import type { PluginErrorTranslations } from "../../types";

export const multiSessionTranslations: PluginErrorTranslations<
	typeof MULTI_SESSION_ERROR_CODES
> = {
	ar: {
		INVALID_SESSION_TOKEN: "رمز الجلسة غير صالح",
	},
	bn: {
		INVALID_SESSION_TOKEN: "সেশনের টোকেনটি অবৈধ",
	},
	de: {
		INVALID_SESSION_TOKEN: "Ungültiges Sitzungs-Token",
	},
	en: {
		INVALID_SESSION_TOKEN: "Invalid session token",
	},
	es: {
		INVALID_SESSION_TOKEN: "Token de sesión inválido",
	},
	fa: {
		INVALID_SESSION_TOKEN: "توکن جلسه نامعتبر است",
	},
	fr: {
		INVALID_SESSION_TOKEN: "Jeton de session invalide",
	},
	hi: {
		INVALID_SESSION_TOKEN: "अवैध सत्र टोकन",
	},
	id: {
		INVALID_SESSION_TOKEN: "Token sesi tidak valid",
	},
	it: {
		INVALID_SESSION_TOKEN: "Token di sessione non valido",
	},
	ja: {
		INVALID_SESSION_TOKEN: "無効なセッショントークン",
	},
	ko: {
		INVALID_SESSION_TOKEN: "유효하지 않은 세션 토큰",
	},
	nl: {
		INVALID_SESSION_TOKEN: "Ongeldig sessietoken",
	},
	pl: {
		INVALID_SESSION_TOKEN: "Nieprawidłowy token sesji",
	},
	pt: {
		INVALID_SESSION_TOKEN: "Token de sessão inválido",
	},
	ru: {
		INVALID_SESSION_TOKEN: "Неверный токен сессии",
	},
	sv: {
		INVALID_SESSION_TOKEN: "Ogiltig sessionstoken",
	},
	th: {
		INVALID_SESSION_TOKEN: "โทเค็นเซสชันไม่ถูกต้อง",
	},
	tr: {
		INVALID_SESSION_TOKEN: "Geçersiz oturum belirteci",
	},
	uk: {
		INVALID_SESSION_TOKEN: "Недійсний токен сесії",
	},
	vi: {
		INVALID_SESSION_TOKEN: "Mã thông báo phiên không hợp lệ",
	},
	zh: {
		INVALID_SESSION_TOKEN: "无效的会话令牌",
	},
};
