import type { STRIPE_ERROR_CODES } from "@better-auth/stripe";
import type { LocalizedTranslations } from "../../../types";

export const idStripe: LocalizedTranslations<typeof STRIPE_ERROR_CODES> = {
	UNAUTHORIZED: "Akses tidak sah",
	INVALID_REQUEST_BODY: "Isi permintaan tidak valid",
	SUBSCRIPTION_NOT_FOUND: "Langganan tidak ditemukan",
	SUBSCRIPTION_PLAN_NOT_FOUND: "Paket langganan tidak ditemukan",
	ALREADY_SUBSCRIBED_PLAN: "Anda sudah berlangganan paket ini",
	REFERENCE_ID_NOT_ALLOWED: "ID referensi tidak diperbolehkan",
	CUSTOMER_NOT_FOUND: "Pelanggan Stripe tidak ditemukan untuk pengguna ini",
	UNABLE_TO_CREATE_CUSTOMER: "Tidak dapat membuat pelanggan",
	UNABLE_TO_CREATE_BILLING_PORTAL: "Tidak dapat membuat sesi portal tagihan",
	STRIPE_SIGNATURE_NOT_FOUND: "Tanda tangan Stripe tidak ditemukan",
	STRIPE_WEBHOOK_SECRET_NOT_FOUND: "Rahasia webhook Stripe tidak ditemukan",
	STRIPE_WEBHOOK_ERROR: "Kesalahan webhook Stripe",
	FAILED_TO_CONSTRUCT_STRIPE_EVENT: "Gagal membuat acara Stripe",
	FAILED_TO_FETCH_PLANS: "Gagal mengambil rencana",
	EMAIL_VERIFICATION_REQUIRED:
		"Verifikasi email diperlukan sebelum Anda dapat berlangganan paket",
	SUBSCRIPTION_NOT_ACTIVE: "Langganan tidak aktif",
	SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
		"Langganan tidak dijadwalkan untuk pembatalan",
	SUBSCRIPTION_NOT_PENDING_CHANGE:
		"Langganan tidak memiliki pembatalan yang tertunda atau perubahan rencana yang dijadwalkan",
	ORGANIZATION_NOT_FOUND: "Organisasi tidak ditemukan",
	ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
		"Langganan organisasi tidak diaktifkan",
	AUTHORIZE_REFERENCE_REQUIRED:
		"Langganan organisasi memerlukan konfigurasi callback authorizeReference",
	ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
		"Tidak dapat menghapus organisasi dengan langganan aktif",
	ORGANIZATION_REFERENCE_ID_REQUIRED:
		"ID Referensi diperlukan. Berikan referenceId atau atur activeOrganizationId dalam sesi",
};
