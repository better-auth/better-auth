import type { ANONYMOUS_ERROR_CODES } from "better-auth/plugins/anonymous";
import type { LocalizedTranslations } from "../../../types";

export const bnAnonymous: LocalizedTranslations<typeof ANONYMOUS_ERROR_CODES> =
	{
		INVALID_EMAIL_FORMAT: "ইমেল একটি বৈধ বিন্যাসে তৈরি করা হয়নি",
		FAILED_TO_CREATE_USER: "ব্যবহারকারী তৈরি করতে ব্যর্থ",
		COULD_NOT_CREATE_SESSION: "সেশন তৈরি করা যায়নি",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"বেনামী ব্যবহারকারীরা আবার বেনামে সাইন ইন করতে পারবেন না",
		FAILED_TO_DELETE_ANONYMOUS_USER: "বেনামী ব্যবহারকারী মুছে ফেলতে ব্যর্থ",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"বেনামী ব্যবহারকারীর সেশন মুছে ফেলতে ব্যর্থ",
		USER_IS_NOT_ANONYMOUS: "ব্যবহারকারী বেনামী নন",
		DELETE_ANONYMOUS_USER_DISABLED: "বেনামী ব্যবহারকারী মুছে ফেলা নিষ্ক্রিয় করা আছে",
	};
