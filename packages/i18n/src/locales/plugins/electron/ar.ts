import type { ELECTRON_ERROR_CODES } from "@better-auth/electron";
import type { LocalizedTranslations } from "../../../types";

export const arElectron: LocalizedTranslations<typeof ELECTRON_ERROR_CODES> = {
	INVALID_CLIENT_ID: "معرف العميل غير صالح",
	INVALID_TOKEN: "الرمز غير صالح أو منتهي الصلاحية.",
	STATE_MISMATCH: "عدم تطابق الحالة",
	MISSING_CODE_CHALLENGE: "تحدي الرمز مفقود",
	INVALID_CODE_VERIFIER: "متحقق الرمز غير صالح",
	MISSING_STATE: "الحالة مطلوبة",
	MISSING_PKCE: "PKCE مطلوبة",
};
