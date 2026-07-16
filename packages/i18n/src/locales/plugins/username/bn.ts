import type { USERNAME_ERROR_CODES } from "better-auth/plugins/username";
import type { LocalizedTranslations } from "../../../types";

export const bnUsername: LocalizedTranslations<typeof USERNAME_ERROR_CODES> = {
	INVALID_USERNAME_OR_PASSWORD: "ব্যবহারকারীর নাম বা পাসওয়ার্ড ভুল",
	EMAIL_NOT_VERIFIED: "ইমেল যাচাই করা হয়নি",
	UNEXPECTED_ERROR: "অপ্রত্যাশিত ত্রুটি",
	USERNAME_IS_ALREADY_TAKEN:
		"ব্যবহারকারীর নাম ইতিমধ্যে নেওয়া হয়েছে। অনুগ্রহ করে অন্যটি চেষ্টা করুন।",
	USERNAME_TOO_SHORT: "ব্যবহারকারীর নাম খুব ছোট",
	USERNAME_TOO_LONG: "ব্যবহারকারীর নাম খুব দীর্ঘ",
	INVALID_USERNAME: "ব্যবহারকারীর নাম অবৈধ",
	INVALID_DISPLAY_USERNAME: "প্রদর্শন নাম অবৈধ",
	USERNAME_IS_IMMUTABLE: "ব্যবহারকারীর নাম আপডেট করা যাবে না",
};
