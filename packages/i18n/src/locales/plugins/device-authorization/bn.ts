import type { DEVICE_AUTHORIZATION_ERROR_CODES } from "better-auth/plugins/device-authorization";
import type { LocalizedTranslations } from "../../../types";

export const bnDeviceAuthorization: LocalizedTranslations<
	typeof DEVICE_AUTHORIZATION_ERROR_CODES
> = {
	INVALID_DEVICE_CODE: "ডিভাইস কোড অবৈধ",
	EXPIRED_DEVICE_CODE: "ডিভাইস কোডের মেয়াদ শেষ হয়ে গেছে",
	EXPIRED_USER_CODE: "ব্যবহারকারী কোডের মেয়াদ শেষ হয়ে গেছে",
	AUTHORIZATION_PENDING: "অনুমোদন বিচারাধীন",
	ACCESS_DENIED: "প্রবেশাধিকার অস্বীকার করা হয়েছে",
	INVALID_USER_CODE: "ব্যবহারকারী কোড অবৈধ",
	DEVICE_CODE_ALREADY_PROCESSED: "ডিভাইস কোড ইতিমধ্যে প্রক্রিয়া করা হয়েছে",
	DEVICE_CODE_NOT_CLAIMED:
		"ডিভাইস কোড কোনো যাচাইকরণ সেশন দ্বারা দাবি করা হয়নি; অনুমোদন বা প্রত্যাখ্যান করার আগে সাইন ইন থাকা অবস্থায় `user_code` সহ `GET /device` কল করুন",
	POLLING_TOO_FREQUENTLY: "অত্যধিক ঘন ঘন পোলিং করা হচ্ছে",
	USER_NOT_FOUND: "ব্যবহারকারী পাওয়া যায়নি",
	FAILED_TO_CREATE_SESSION: "সেশন তৈরি করতে ব্যর্থ",
	INVALID_DEVICE_CODE_STATUS: "ডিভাইস কোডের স্থিতি অবৈধ",
	AUTHENTICATION_REQUIRED: "প্রমাণীকরণ প্রয়োজন",
};
