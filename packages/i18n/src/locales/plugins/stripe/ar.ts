import type { STRIPE_ERROR_CODES } from "@better-auth/stripe";
import type { LocalizedTranslations } from "../../../types";

export const arStripe: LocalizedTranslations<typeof STRIPE_ERROR_CODES> = {
	UNAUTHORIZED: "وصول غير مصرح به",
	INVALID_REQUEST_BODY: "جسم طلب غير صالح",
	SUBSCRIPTION_NOT_FOUND: "الاشتراك غير موجود",
	SUBSCRIPTION_PLAN_NOT_FOUND: "خطة الاشتراك غير موجودة",
	ALREADY_SUBSCRIBED_PLAN: "أنت مشترك بالفعل في هذه الخطة",
	REFERENCE_ID_NOT_ALLOWED: "المعرف المرجعي غير مسموح به",
	CUSTOMER_NOT_FOUND: "لم يتم العثور على عميل Stripe لهذا المستخدم",
	UNABLE_TO_CREATE_CUSTOMER: "غير قادر على إنشاء عميل",
	UNABLE_TO_CREATE_BILLING_PORTAL: "غير قادر على إنشاء جلسة بوابة الفواتير",
	STRIPE_SIGNATURE_NOT_FOUND: "توقيع Stripe غير موجود",
	STRIPE_WEBHOOK_SECRET_NOT_FOUND: "سر Stripe webhook غير موجود",
	STRIPE_WEBHOOK_ERROR: "خطأ في Stripe webhook",
	FAILED_TO_CONSTRUCT_STRIPE_EVENT: "فشل بناء حدث Stripe",
	FAILED_TO_FETCH_PLANS: "فشل جلب الخطط",
	EMAIL_VERIFICATION_REQUIRED:
		"التحقق من البريد الإلكتروني مطلوب قبل أن تتمكن من الاشتراك في خطة",
	SUBSCRIPTION_NOT_ACTIVE: "الاشتراك غير نشط",
	SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION: "الاشتراك غير مجدول للإلغاء",
	SUBSCRIPTION_NOT_PENDING_CHANGE:
		"ليس لدى الاشتراك إلغاء معلق أو تغيير خطة مجدول",
	ORGANIZATION_NOT_FOUND: "المنظمة غير موجودة",
	ORGANIZATION_SUBSCRIPTION_NOT_ENABLED: "اشتراك المنظمة غير مفعل",
	AUTHORIZE_REFERENCE_REQUIRED:
		"تتطلب اشتراكات المنظمة تهيئة استدعاء authorizeReference",
	ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
		"لا يمكن حذف المنظمة التي لديها اشتراك نشط",
	ORGANIZATION_REFERENCE_ID_REQUIRED:
		"المعرف المرجعي مطلوب. يرجى تقديم referenceId أو تعيين activeOrganizationId في الجلسة",
};
