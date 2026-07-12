import type { PASSKEY_ERROR_CODES } from "@better-auth/passkey";
import type { LocalizedTranslations } from "../../../types";

export const trPasskey: LocalizedTranslations<typeof PASSKEY_ERROR_CODES> = {
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
};
