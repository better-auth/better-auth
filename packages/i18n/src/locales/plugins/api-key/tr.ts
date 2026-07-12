import type { API_KEY_ERROR_CODES } from "@better-auth/api-key";
import type { LocalizedTranslations } from "../../../types";

export const trApiKey: LocalizedTranslations<typeof API_KEY_ERROR_CODES> = {
	INVALID_METADATA_TYPE: "metadata nesne veya tanımsız olmalıdır",
	REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
		"refillInterval sağlandığında refillAmount gereklidir",
	REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
		"refillAmount sağlandığında refillInterval gereklidir",
	USER_BANNED: "Kullanıcı engellendi",
	UNAUTHORIZED_SESSION: "Yetkisiz veya geçersiz oturum",
	KEY_NOT_FOUND: "API Anahtarı bulunamadı",
	KEY_DISABLED: "API Anahtarı devre dışı",
	KEY_EXPIRED: "API Anahtarının süresi doldu",
	USAGE_EXCEEDED: "API Anahtarı kullanım sınırına ulaştı",
	KEY_NOT_RECOVERABLE: "API Anahtarı kurtarılamaz",
	EXPIRES_IN_IS_TOO_SMALL:
		"expiresIn değeri önceden tanımlanmış minimum değerden küçük.",
	EXPIRES_IN_IS_TOO_LARGE:
		"expiresIn değeri önceden tanımlanmış maksimum değerden büyük.",
	INVALID_REMAINING: "Kalan sayı ya çok büyük ya da çok küçük.",
	INVALID_PREFIX_LENGTH: "Önek uzunluğu ya çok büyük ya da çok küçük.",
	INVALID_NAME_LENGTH: "Ad uzunluğu ya çok büyük ya da çok küçük.",
	METADATA_DISABLED: "Metadata devre dışı bırakıldı.",
	RATE_LIMIT_EXCEEDED: "İstek oranı sınırı aşıldı.",
	NO_VALUES_TO_UPDATE: "Güncellenecek değer yok.",
	KEY_DISABLED_EXPIRATION: "Özel anahtar son kullanma değerleri devre dışı.",
	INVALID_API_KEY: "Geçersiz API anahtarı.",
	INVALID_USER_ID_FROM_API_KEY: "API anahtarındaki kullanıcı kimliği geçersiz.",
	INVALID_REFERENCE_ID_FROM_API_KEY:
		"API anahtarındaki referans kimliği geçersiz.",
	INVALID_API_KEY_GETTER_RETURN_TYPE:
		"API Anahtarı alıcısı geçersiz bir anahtar türü döndürdü. Dizi bekleniyordu.",
	SERVER_ONLY_PROPERTY:
		"Ayarlamaya çalıştığınız özellik yalnızca sunucu kimlik doğrulama örneğinden ayarlanabilir.",
	FAILED_TO_UPDATE_API_KEY: "API anahtarı güncellenemedi",
	NAME_REQUIRED: "API Anahtarı adı gerekli.",
	ORGANIZATION_ID_REQUIRED:
		"Organizasyona ait API anahtarları için Organizasyon Kimliği gereklidir.",
	USER_NOT_MEMBER_OF_ORGANIZATION:
		"Bu API anahtarına sahip olan organizasyonun üyesi değilsiniz.",
	INSUFFICIENT_API_KEY_PERMISSIONS:
		"Organizasyon API anahtarları üzerinde bu işlemi gerçekleştirme izniniz yok.",
	NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
		"Varsayılan api-anahtarı yapılandırması bulunamadı.",
	ORGANIZATION_PLUGIN_REQUIRED:
		"Organizasyona ait API anahtarları için organizasyon eklentisi gereklidir. Lütfen organizasyon eklentisini kurun ve yapılandırın.",
};
