import type { USERNAME_ERROR_CODES } from "better-auth/plugins/username";
import type { LocalizedTranslations } from "../../../types";

export const trUsername: LocalizedTranslations<typeof USERNAME_ERROR_CODES> = {
	INVALID_USERNAME_OR_PASSWORD: "Geçersiz kullanıcı adı veya şifre",
	EMAIL_NOT_VERIFIED: "E-posta doğrulanmadı",
	UNEXPECTED_ERROR: "Beklenmeyen hata",
	USERNAME_IS_ALREADY_TAKEN:
		"Bu kullanıcı adı zaten alınmış. Lütfen başka bir tane deneyin.",
	USERNAME_TOO_SHORT: "Kullanıcı adı çok kısa",
	USERNAME_TOO_LONG: "Kullanıcı adı çok uzun",
	INVALID_USERNAME: "Geçersiz kullanıcı adı",
	INVALID_DISPLAY_USERNAME: "Geçersiz görünen kullanıcı adı",
	USERNAME_IS_IMMUTABLE: "Kullanıcı adı güncellenemez",
};
