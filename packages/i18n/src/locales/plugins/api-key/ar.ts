import type { API_KEY_ERROR_CODES } from "@better-auth/api-key";
import type { LocalizedTranslations } from "../../../types";

export const arApiKey: LocalizedTranslations<typeof API_KEY_ERROR_CODES> = {
	INVALID_METADATA_TYPE: "يجب أن تكون البيانات التعريفية كائنًا أو غير محددة",
	REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
		"مطلوب refillAmount عند توفير refillInterval",
	REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
		"مطلوب refillInterval عند توفير refillAmount",
	USER_BANNED: "المستخدم محظور",
	UNAUTHORIZED_SESSION: "جلسة غير مصرح بها أو غير صالحة",
	KEY_NOT_FOUND: "مفتاح API غير موجود",
	KEY_DISABLED: "مفتاح API معطل",
	KEY_EXPIRED: "انتهت صلاحية مفتاح API",
	USAGE_EXCEEDED: "تجاوز مفتاح API حد الاستخدام الخاص به",
	KEY_NOT_RECOVERABLE: "مفتاح API غير قابل للاسترداد",
	EXPIRES_IN_IS_TOO_SMALL: "قيمة expiresIn أصغر من الحد الأدنى المحدد مسبقًا.",
	EXPIRES_IN_IS_TOO_LARGE: "قيمة expiresIn أكبر من الحد الأقصى المحدد مسبقًا.",
	INVALID_REMAINING: "العدد المتبقي إما كبير جدًا أو صغير جدًا.",
	INVALID_PREFIX_LENGTH: "طول البادئة إما كبير جدًا أو صغير جدًا.",
	INVALID_NAME_LENGTH: "طول الاسم إما كبير جدًا أو صغير جدًا.",
	METADATA_DISABLED: "البيانات التعريفية معطلة.",
	RATE_LIMIT_EXCEEDED: "تم تجاوز حد المعدل.",
	NO_VALUES_TO_UPDATE: "لا توجد قيم لتحديثها.",
	KEY_DISABLED_EXPIRATION: "قيم انتهاء الصلاحية المخصصة للمفتاح معطلة.",
	INVALID_API_KEY: "مفتاح API غير صالح.",
	INVALID_USER_ID_FROM_API_KEY: "معرف المستخدم من مفتاح API غير صالح.",
	INVALID_REFERENCE_ID_FROM_API_KEY: "معرف المرجع من مفتاح API غير صالح.",
	INVALID_API_KEY_GETTER_RETURN_TYPE:
		"أرجع جالب مفتاح API نوع مفتاح غير صالح. المتوقع سلسلة نصية.",
	SERVER_ONLY_PROPERTY:
		"لا يمكن تعيين الخاصية التي تحاول تعيينها إلا من مثيل مصادقة الخادم فقط.",
	FAILED_TO_UPDATE_API_KEY: "فشل تحديث مفتاح API",
	NAME_REQUIRED: "اسم مفتاح API مطلوب.",
	ORGANIZATION_ID_REQUIRED: "معرف المنظمة مطلوب لمفاتيح API المملوكة للمنظمة.",
	USER_NOT_MEMBER_OF_ORGANIZATION:
		"أنت لست عضوًا في المنظمة التي تمتلك مفتاح API هذا.",
	INSUFFICIENT_API_KEY_PERMISSIONS:
		"ليس لديك إذن لتنفيذ هذا الإجراء على مفاتيح API الخاصة بالمنظمة.",
	NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
		"لم يتم العثور على تكوين افتراضي لمفتاح API.",
	ORGANIZATION_PLUGIN_REQUIRED:
		"مكون المنظمة مطلوب لمفاتيح API المملوكة للمنظمة. يرجى تثبيت وتهيئة مكون المنظمة.",
};
