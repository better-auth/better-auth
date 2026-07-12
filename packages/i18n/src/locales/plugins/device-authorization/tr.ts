import type { DEVICE_AUTHORIZATION_ERROR_CODES } from "better-auth/plugins/device-authorization";
import type { LocalizedTranslations } from "../../../types";

export const trDeviceAuthorization: LocalizedTranslations<
	typeof DEVICE_AUTHORIZATION_ERROR_CODES
> = {
	INVALID_DEVICE_CODE: "Geçersiz cihaz kodu",
	EXPIRED_DEVICE_CODE: "Cihaz kodunun süresi dolmuş",
	EXPIRED_USER_CODE: "Kullanıcı kodunun süresi dolmuş",
	AUTHORIZATION_PENDING: "Yetkilendirme bekleniyor",
	ACCESS_DENIED: "Erişim reddedildi",
	INVALID_USER_CODE: "Geçersiz kullanıcı kodu",
	DEVICE_CODE_ALREADY_PROCESSED: "Cihaz kodu zaten işlenmiş",
	DEVICE_CODE_NOT_CLAIMED:
		"Cihaz kodu bir doğrulama oturumu tarafından talep edilmemiş; onaylamadan veya reddetmeden önce oturum açıkken `user_code` ile `GET /device` çağrısı yapın",
	POLLING_TOO_FREQUENTLY: "Çok sık istek gönderiliyor",
	USER_NOT_FOUND: "Kullanıcı bulunamadı",
	FAILED_TO_CREATE_SESSION: "Oturum oluşturulamadı",
	INVALID_DEVICE_CODE_STATUS: "Geçersiz cihaz kodu durumu",
	AUTHENTICATION_REQUIRED: "Kimlik doğrulaması gerekli",
};
