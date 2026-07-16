import type { API_KEY_ERROR_CODES } from "@better-auth/api-key";
import type { LocalizedTranslations } from "../../../types";

export const faApiKey: LocalizedTranslations<typeof API_KEY_ERROR_CODES> = {
	INVALID_METADATA_TYPE: "متادیتا باید یک شی یا تعریف نشده باشد",
	REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
		"وارد کردن refillAmount الزامی است وقتی refillInterval ارائه می‌شود",
	REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
		"وارد کردن refillInterval الزامی است وقتی refillAmount ارائه می‌شود",
	USER_BANNED: "کاربر مسدود شده است",
	UNAUTHORIZED_SESSION: "نشست غیرمجاز یا نامعتبر",
	KEY_NOT_FOUND: "کلید API یافت نشد",
	KEY_DISABLED: "کلید API غیرفعال است",
	KEY_EXPIRED: "کلید API منقضی شده است",
	USAGE_EXCEEDED: "کلید API به حد مجاز استفاده خود رسیده است",
	KEY_NOT_RECOVERABLE: "کلید API قابل بازیابی نیست",
	EXPIRES_IN_IS_TOO_SMALL: "مقدار expiresIn از حداقل مقدار پیش‌فرض کوچک‌تر است.",
	EXPIRES_IN_IS_TOO_LARGE: "مقدار expiresIn از حداکثر مقدار پیش‌فرض بزرگ‌تر است.",
	INVALID_REMAINING: "تعداد باقی‌مانده خیلی بزرگ یا خیلی کوچک است.",
	INVALID_PREFIX_LENGTH: "طول پیشوند خیلی بزرگ یا خیلی کوچک است.",
	INVALID_NAME_LENGTH: "طول نام خیلی بزرگ یا خیلی کوچک است.",
	METADATA_DISABLED: "متادیتا غیرفعال است.",
	RATE_LIMIT_EXCEEDED: "محدودیت نرخ فراتر رفته است.",
	NO_VALUES_TO_UPDATE: "هیچ مقداری برای بروزرسانی وجود ندارد.",
	KEY_DISABLED_EXPIRATION: "مقادیر انقضای سفارشی کلید غیرفعال است.",
	INVALID_API_KEY: "کلید API نامعتبر است.",
	INVALID_USER_ID_FROM_API_KEY: "شناسه کاربر از کلید API نامعتبر است.",
	INVALID_REFERENCE_ID_FROM_API_KEY: "شناسه مرجع از کلید API نامعتبر است.",
	INVALID_API_KEY_GETTER_RETURN_TYPE:
		"گیرنده کلید API نوع کلید نامعتبر بازگرداند. رشته متنی مورد انتظار بود.",
	SERVER_ONLY_PROPERTY:
		"ویژگی که می‌خواهید تنظیم کنید فقط از طریق نمونه احراز هویت سرور قابل تنظیم است.",
	FAILED_TO_UPDATE_API_KEY: "بروزرسانی کلید API ناموفق بود",
	NAME_REQUIRED: "نام کلید API الزامی است.",
	ORGANIZATION_ID_REQUIRED:
		"شناسه سازمان برای کلیدهای API متعلق به سازمان الزامی است.",
	USER_NOT_MEMBER_OF_ORGANIZATION:
		"شما عضو سازمانی که صاحب این کلید API است نیستید.",
	INSUFFICIENT_API_KEY_PERMISSIONS:
		"شما اجازه انجام این کار را روی کلیدهای API سازمان ندارید.",
	NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
		"هیچ پیکربندی پیش‌فرضی برای کلید API یافت نشد.",
	ORGANIZATION_PLUGIN_REQUIRED:
		"پلاگین سازمان برای کلیدهای API متعلق به سازمان الزامی است. لطفا پلاگین سازمان را نصب و پیکربندی کنید.",
};
