import type { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins/two-factor";
import type { LocalizedTranslations } from "../../../types";

export const bnTwoFactor: LocalizedTranslations<typeof TWO_FACTOR_ERROR_CODES> =
	{
		OTP_NOT_ENABLED: "OTP সক্রিয় নেই",
		OTP_NOT_CONFIGURED: "OTP কনফিগার করা হয়নি",
		OTP_HAS_EXPIRED: "OTP মেয়াদ শেষ হয়ে গেছে",
		TOTP_NOT_ENABLED: "TOTP সক্রিয় নেই",
		TOTP_NOT_CONFIGURED: "TOTP কনফিগার করা হয়নি",
		TWO_FACTOR_NOT_ENABLED: "দুই-ফ্যাক্টর প্রমাণীকরণ সক্রিয় নেই",
		BACKUP_CODES_NOT_ENABLED: "ব্যাকআপ কোড সক্রিয় নেই",
		INVALID_BACKUP_CODE: "ব্যাকআপ কোড অবৈধ বা ইতিমধ্যে ব্যবহৃত হয়েছে।",
		INVALID_CODE: "আপনি যে কোড দিয়েছেন তা ভুল। অনুগ্রহ করে পরীক্ষা করে আবার চেষ্টা করুন।",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"অনেক বেশি চেষ্টা হয়েছে। অনুগ্রহ করে নতুন কোড অনুরোধ করুন।",
		ACCOUNT_TEMPORARILY_LOCKED:
			"অনেক বেশি যাচাইকরণ ব্যর্থতা। আপনার অ্যাকাউন্ট সাময়িকভাবে লক করা হয়েছে। পরে আবার চেষ্টা করুন।",
		INVALID_TWO_FACTOR_COOKIE: "দুই-ফ্যাক্টর প্রমাণীকরণ কুকি অবৈধ",
	};
