import type { PHONE_NUMBER_ERROR_CODES } from "better-auth/plugins/phone-number";
import type { LocalizedTranslations } from "../../../types";

export const bnPhoneNumber: LocalizedTranslations<
	typeof PHONE_NUMBER_ERROR_CODES
> = {
	INVALID_PHONE_NUMBER: "অবৈধ ফোন নম্বর",
	PHONE_NUMBER_EXIST: "ফোন নম্বরটি ইতিমধ্যে বিদ্যমান",
	PHONE_NUMBER_NOT_EXIST: "ফোন নম্বরটি নিবন্ধিত নয়",
	INVALID_PHONE_NUMBER_OR_PASSWORD: "অবৈধ ফোন নম্বর বা পাসওয়ার্ড",
	UNEXPECTED_ERROR: "অপ্রত্যাশিত ত্রুটি",
	OTP_NOT_FOUND: "OTP পাওয়া যায়নি",
	OTP_EXPIRED: "OTP মেয়াদ শেষ হয়ে গেছে",
	INVALID_OTP: "অবৈধ OTP",
	PHONE_NUMBER_NOT_VERIFIED: "ফোন নম্বর যাচাই করা হয়নি",
	PHONE_NUMBER_CANNOT_BE_UPDATED: "ফোন নম্বর আপডেট করা যাবে না",
	SEND_OTP_NOT_IMPLEMENTED: "sendOTP প্রয়োগ করা হয়নি",
	TOO_MANY_ATTEMPTS: "অনেক বেশি চেষ্টা হয়েছে। পরে আবার চেষ্টা করুন।",
};
