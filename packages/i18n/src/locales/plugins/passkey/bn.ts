import type { PASSKEY_ERROR_CODES } from "@better-auth/passkey";
import type { LocalizedTranslations } from "../../../types";

export const bnPasskey: LocalizedTranslations<typeof PASSKEY_ERROR_CODES> = {
	CHALLENGE_NOT_FOUND: "চ্যালেঞ্জ পাওয়া যায়নি",
	YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
		"আপনার এই পাসকি নিবন্ধন করার অনুমতি নেই",
	FAILED_TO_VERIFY_REGISTRATION: "নিবন্ধন যাচাই করতে ব্যর্থ হয়েছে",
	PASSKEY_NOT_FOUND: "পাসকি পাওয়া যায়নি",
	AUTHENTICATION_FAILED: "প্রমাণীকরণ ব্যর্থ হয়েছে",
	UNABLE_TO_CREATE_SESSION: "সেশন তৈরি করতে অক্ষম",
	FAILED_TO_UPDATE_PASSKEY: "পাসকি আপডেট করতে ব্যর্থ হয়েছে",
	PREVIOUSLY_REGISTERED: "ইতিমধ্যে নিবন্ধিত",
	REGISTRATION_CANCELLED: "নিবন্ধন বাতিল করা হয়েছে",
	AUTH_CANCELLED: "প্রমাণীকরণ বাতিল করা হয়েছে",
	UNKNOWN_ERROR: "অজানা ত্রুটি দেখা দিয়েছে",
	SESSION_REQUIRED: "পাসকি নিবন্ধনের জন্য একটি প্রমাণিত সেশন প্রয়োজন",
	RESOLVE_USER_REQUIRED:
		"পাসকি নিবন্ধনের জন্য একটি প্রমাণিত সেশন বা resolveUser কলব্যাক প্রয়োজন যখন requireSession মিথ্যা হয়",
	RESOLVED_USER_INVALID: "সমাধানকৃত ব্যবহারকারী অবৈধ",
};
