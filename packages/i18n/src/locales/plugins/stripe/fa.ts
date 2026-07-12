import type { STRIPE_ERROR_CODES } from "@better-auth/stripe";
import type { LocalizedTranslations } from "../../../types";

export const faStripe: LocalizedTranslations<typeof STRIPE_ERROR_CODES> = {
	UNAUTHORIZED: "دسترسی غیرمجاز",
	INVALID_REQUEST_BODY: "پیکره درخواست نامعتبر است",
	SUBSCRIPTION_NOT_FOUND: "اشتراک یافت نشد",
	SUBSCRIPTION_PLAN_NOT_FOUND: "طرح اشتراک یافت نشد",
	ALREADY_SUBSCRIBED_PLAN: "شما در حال حاضر مشترک این طرح هستید",
	REFERENCE_ID_NOT_ALLOWED: "شناسه مرجع مجاز نیست",
	CUSTOMER_NOT_FOUND: "مشتری Stripe برای این کاربر یافت نشد",
	UNABLE_TO_CREATE_CUSTOMER: "امکان ایجاد مشتری وجود ندارد",
	UNABLE_TO_CREATE_BILLING_PORTAL: "امکان ایجاد نشست پرتال صورتحساب وجود ندارد",
	STRIPE_SIGNATURE_NOT_FOUND: "امضای Stripe یافت نشد",
	STRIPE_WEBHOOK_SECRET_NOT_FOUND: "راز هوک وب Stripe یافت نشد",
	STRIPE_WEBHOOK_ERROR: "خطای هوک وب Stripe",
	FAILED_TO_CONSTRUCT_STRIPE_EVENT: "ساخت رویداد Stripe ناموفق بود",
	FAILED_TO_FETCH_PLANS: "دریافت طرح‌ها ناموفق بود",
	EMAIL_VERIFICATION_REQUIRED: "تایید ایمیل پیش از مشترک شدن در طرح الزامی است",
	SUBSCRIPTION_NOT_ACTIVE: "اشتراک فعال نیست",
	SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
		"اشتراک برای لغو برنامه‌ریزی نشده است",
	SUBSCRIPTION_NOT_PENDING_CHANGE:
		"اشتراک هیچ لغو معلق یا تغییر طرح برنامه‌ریزی شده‌ای ندارد",
	ORGANIZATION_NOT_FOUND: "سازمان یافت نشد",
	ORGANIZATION_SUBSCRIPTION_NOT_ENABLED: "اشتراک سازمان فعال نیست",
	AUTHORIZE_REFERENCE_REQUIRED:
		"اشتراک‌های سازمان نیاز به پیکربندی تابع بازخورد authorizeReference دارند",
	ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
		"امکان حذف سازمان با اشتراک فعال وجود ندارد",
	ORGANIZATION_REFERENCE_ID_REQUIRED:
		"شناسه مرجع الزامی است. referenceId را ارائه دهید یا activeOrganizationId را در نشست تنظیم کنید",
};
