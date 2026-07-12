import type { STRIPE_ERROR_CODES } from "@better-auth/stripe";
import type { LocalizedTranslations } from "../../../types";

export const trStripe: LocalizedTranslations<typeof STRIPE_ERROR_CODES> = {
	UNAUTHORIZED: "Yetkisiz erişim",
	INVALID_REQUEST_BODY: "Geçersiz istek gövdesi",
	SUBSCRIPTION_NOT_FOUND: "Abonelik bulunamadı",
	SUBSCRIPTION_PLAN_NOT_FOUND: "Abonelik planı bulunamadı",
	ALREADY_SUBSCRIBED_PLAN: "Zaten bu plana abonesiniz",
	REFERENCE_ID_NOT_ALLOWED: "Referans kimliğine izin verilmiyor",
	CUSTOMER_NOT_FOUND: "Bu kullanıcı için Stripe müşterisi bulunamadı",
	UNABLE_TO_CREATE_CUSTOMER: "Müşteri oluşturulamadı",
	UNABLE_TO_CREATE_BILLING_PORTAL: "Fatura portalı oturumu oluşturulamadı",
	STRIPE_SIGNATURE_NOT_FOUND: "Stripe imzası bulunamadı",
	STRIPE_WEBHOOK_SECRET_NOT_FOUND: "Stripe webhook sırrı bulunamadı",
	STRIPE_WEBHOOK_ERROR: "Stripe webhook hatası",
	FAILED_TO_CONSTRUCT_STRIPE_EVENT: "Stripe olayı oluşturulamadı",
	FAILED_TO_FETCH_PLANS: "Planlar getirilemedi",
	EMAIL_VERIFICATION_REQUIRED:
		"Bir plana abone olmadan önce e-posta doğrulaması gereklidir",
	SUBSCRIPTION_NOT_ACTIVE: "Abonelik aktif değil",
	SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
		"Abonelik iptal için planlanmamış",
	SUBSCRIPTION_NOT_PENDING_CHANGE:
		"Aboneliğin bekleyen bir iptali veya planlanmış plan değişikliği yok",
	ORGANIZATION_NOT_FOUND: "Organizasyon bulunamadı",
	ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
		"Organizasyon aboneliği etkinleştirilmemiş",
	AUTHORIZE_REFERENCE_REQUIRED:
		"Organizasyon abonelikleri authorizeReference geri çağrısının yapılandırılmasını gerektirir",
	ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
		"Aktif aboneliği olan organizasyon silinemez",
	ORGANIZATION_REFERENCE_ID_REQUIRED:
		"Referans Kimliği gereklidir. referenceId sağlayın veya oturumda activeOrganizationId belirleyin",
};
