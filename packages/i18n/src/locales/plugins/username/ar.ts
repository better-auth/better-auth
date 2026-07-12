import type { USERNAME_ERROR_CODES } from "better-auth/plugins/username";
import type { LocalizedTranslations } from "../../../types";

export const arUsername: LocalizedTranslations<typeof USERNAME_ERROR_CODES> = {
	INVALID_USERNAME_OR_PASSWORD: "اسم المستخدم أو كلمة المرور غير صالحة",
	EMAIL_NOT_VERIFIED: "البريد الإلكتروني غير مؤكد",
	UNEXPECTED_ERROR: "حدث خطأ غير متوقع",
	USERNAME_IS_ALREADY_TAKEN: "اسم المستخدم مستخدم بالفعل. يرجى اختيار اسم آخر.",
	USERNAME_TOO_SHORT: "اسم المستخدم قصير جداً",
	USERNAME_TOO_LONG: "اسم المستخدم طويل جداً",
	INVALID_USERNAME: "اسم المستخدم غير صالح",
	INVALID_DISPLAY_USERNAME: "اسم العرض غير صالح",
	USERNAME_IS_IMMUTABLE: "لا يمكن تحديث اسم المستخدم",
};
