import type { OAUTH_POPUP_ERROR_CODES } from "better-auth/plugins";
import type { LocalizedTranslations } from "../../../types";

export const bnOauthPopup: LocalizedTranslations<
	typeof OAUTH_POPUP_ERROR_CODES
> = {
	POPUP_SIGN_IN_FAILED: "পপআপ সাইন-ইন ব্যর্থ হয়েছে",
	POPUP_BLOCKED: "সাইন-ইন পপআপ ব্রাউজার দ্বারা ব্লক করা হয়েছে",
	POPUP_CLOSED: "সাইন-ইন পপআপ সম্পূর্ণ হওয়ার আগে বন্ধ হয়ে গেছে",
	POPUP_TIMEOUT: "সাইন-ইন পপআপের সময় শেষ হয়ে গেছে",
};
