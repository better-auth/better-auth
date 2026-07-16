import type { API_KEY_ERROR_CODES } from "@better-auth/api-key";
import type { LocalizedTranslations } from "../../../types";

export const bnApiKey: LocalizedTranslations<typeof API_KEY_ERROR_CODES> = {
	INVALID_METADATA_TYPE: "মেটাডেটা অবশ্যই একটি অবজেক্ট বা অনির্ধারিত হতে হবে",
	REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
		"refillInterval প্রদান করা হলে refillAmount প্রয়োজন",
	REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
		"refillAmount প্রদান করা হলে refillInterval প্রয়োজন",
	USER_BANNED: "ব্যবহারকারী নিষিদ্ধ",
	UNAUTHORIZED_SESSION: "অননুমোদিত বা অবৈধ সেশন",
	KEY_NOT_FOUND: "API কী পাওয়া যায়নি",
	KEY_DISABLED: "API কী নিষ্ক্রিয় করা হয়েছে",
	KEY_EXPIRED: "API কী এর মেয়াদ শেষ হয়ে গেছে",
	USAGE_EXCEEDED: "API কী এর ব্যবহারের সীমা অতিক্রম করেছে",
	KEY_NOT_RECOVERABLE: "API কী পুনরুদ্ধারযোগ্য নয়",
	EXPIRES_IN_IS_TOO_SMALL: "expiresIn পূর্বনির্ধারিত সর্বনিম্ন মানের চেয়ে ছোট।",
	EXPIRES_IN_IS_TOO_LARGE: "expiresIn পূর্বনির্ধারিত সর্বোচ্চ মানের চেয়ে বড়।",
	INVALID_REMAINING: "অবশিষ্ট সংখ্যাটি হয় খুব বড় বা খুব ছোট।",
	INVALID_PREFIX_LENGTH: "প্রিফিক্স দৈর্ঘ্য হয় খুব বড় বা খুব ছোট।",
	INVALID_NAME_LENGTH: "নামের দৈর্ঘ্য হয় খুব বড় বা খুব ছোট।",
	METADATA_DISABLED: "মেটাডেটা নিষ্ক্রিয় করা হয়েছে।",
	RATE_LIMIT_EXCEEDED: "হারের সীমা অতিক্রম করেছে।",
	NO_VALUES_TO_UPDATE: "আপডেট করার কোনো মান নেই।",
	KEY_DISABLED_EXPIRATION: "কাস্টম কী এর মেয়াদ শেষ হওয়ার মান নিষ্ক্রিয় করা হয়েছে।",
	INVALID_API_KEY: "API কী অবৈধ।",
	INVALID_USER_ID_FROM_API_KEY: "API কী থেকে ব্যবহারকারী আইডি অবৈধ।",
	INVALID_REFERENCE_ID_FROM_API_KEY: "API কী থেকে রেফারেন্স আইডি অবৈধ।",
	INVALID_API_KEY_GETTER_RETURN_TYPE:
		"API কী গেটার একটি অবৈধ কী টাইপ রিটার্ন করেছে। স্ট্রিং প্রত্যাশিত।",
	SERVER_ONLY_PROPERTY:
		"যে প্রপার্টি সেট করার চেষ্টা করছেন তা কেবল সার্ভার অথ ইনস্ট্যান্স থেকে সেট করা সম্ভব।",
	FAILED_TO_UPDATE_API_KEY: "API কী আপডেট করতে ব্যর্থ হয়েছে",
	NAME_REQUIRED: "API কী এর নাম প্রয়োজন।",
	ORGANIZATION_ID_REQUIRED: "সংস্থার মালিকানাধীন API কী-এর জন্য সংস্থা আইডি প্রয়োজন।",
	USER_NOT_MEMBER_OF_ORGANIZATION: "আপনি এই API কী এর মালিকানাধীন সংস্থার সদস্য নন।",
	INSUFFICIENT_API_KEY_PERMISSIONS:
		"সংস্থার API কী-তে এই কাজটি করার জন্য আপনার অনুমতি নেই।",
	NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
		"কোনো ডিফল্ট API কী কনফিগারেশন পাওয়া যায়নি।",
	ORGANIZATION_PLUGIN_REQUIRED:
		"সংস্থার মালিকানাধীন API কী-এর জন্য সংস্থা প্লাগইন প্রয়োজন। অনুগ্রহ করে সংস্থা প্লাগইনটি ইনস্টল এবং কনফিগার করুন।",
};
