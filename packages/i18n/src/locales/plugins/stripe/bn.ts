import type { STRIPE_ERROR_CODES } from "@better-auth/stripe";
import type { LocalizedTranslations } from "../../../types";

export const bnStripe: LocalizedTranslations<typeof STRIPE_ERROR_CODES> = {
	UNAUTHORIZED: "অননুমোদিত অ্যাক্সেস",
	INVALID_REQUEST_BODY: "অনুরোধের মূল অংশটি অবৈধ",
	SUBSCRIPTION_NOT_FOUND: "সাবস্ক্রিপশন পাওয়া যায়নি",
	SUBSCRIPTION_PLAN_NOT_FOUND: "সাবস্ক্রিপশন প্ল্যান পাওয়া যায়নি",
	ALREADY_SUBSCRIBED_PLAN: "আপনি ইতিমধ্যেই এই প্ল্যানে সাবস্ক্রাইব করেছেন",
	REFERENCE_ID_NOT_ALLOWED: "রেফারেন্স আইডি অনুমোদিত নয়",
	CUSTOMER_NOT_FOUND: "এই ব্যবহারকারীর জন্য স্ট্রাইপ কাস্টমার পাওয়া যায়নি",
	UNABLE_TO_CREATE_CUSTOMER: "কাস্টমার তৈরি করতে অক্ষম",
	UNABLE_TO_CREATE_BILLING_PORTAL: "বিলিং পোর্টাল সেশন তৈরি করতে অক্ষম",
	STRIPE_SIGNATURE_NOT_FOUND: "স্ট্রাইপ সিগনেচার পাওয়া যায়নি",
	STRIPE_WEBHOOK_SECRET_NOT_FOUND: "স্ট্রাইপ ওয়েবহুক সিক্রেট পাওয়া যায়নি",
	STRIPE_WEBHOOK_ERROR: "স্ট্রাইপ ওয়েবহুক ত্রুটি",
	FAILED_TO_CONSTRUCT_STRIPE_EVENT: "স্ট্রাইপ ইভেন্ট তৈরি করতে ব্যর্থ হয়েছে",
	FAILED_TO_FETCH_PLANS: "প্ল্যানগুলো আনতে ব্যর্থ হয়েছে",
	EMAIL_VERIFICATION_REQUIRED: "একটি প্ল্যানে সাবস্ক্রাইব করার আগে ইমেল যাচাইকরণ প্রয়োজন",
	SUBSCRIPTION_NOT_ACTIVE: "সাবস্ক্রিপশন সক্রিয় নয়",
	SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
		"সাবস্ক্রিপশন বাতিলের জন্য নির্ধারিত নয়",
	SUBSCRIPTION_NOT_PENDING_CHANGE:
		"সাবস্ক্রিপশনে কোনো মুলতুবি বাতিল বা নির্ধারিত প্ল্যান পরিবর্তন নেই",
	ORGANIZATION_NOT_FOUND: "সংস্থা পাওয়া যায়নি",
	ORGANIZATION_SUBSCRIPTION_NOT_ENABLED: "সংস্থার সাবস্ক্রিপশন সক্রিয় করা নেই",
	AUTHORIZE_REFERENCE_REQUIRED:
		"সংস্থার সাবস্ক্রিপশনের জন্য authorizeReference কলব্যাক কনফিগার করা প্রয়োজন",
	ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
		"সক্রিয় সাবস্ক্রিপশন থাকা অবস্থায় সংস্থাটি মুছে ফেলা যাবে না",
	ORGANIZATION_REFERENCE_ID_REQUIRED:
		"রেফারেন্স আইডি প্রয়োজন। referenceId প্রদান করুন অথবা সেশনে activeOrganizationId সেট করুন",
};
