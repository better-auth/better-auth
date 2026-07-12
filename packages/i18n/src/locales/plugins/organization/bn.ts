import type { ORGANIZATION_ERROR_CODES } from "better-auth/plugins/organization";
import type { LocalizedTranslations } from "../../../types";

export const bnOrganization: LocalizedTranslations<
	typeof ORGANIZATION_ERROR_CODES
> = {
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
		"আপনাকে একটি নতুন সংস্থা তৈরি করার অনুমতি দেওয়া হয়নি",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
		"আপনি সংস্থার সর্বাধিক সংখ্যায় পৌঁছেছেন",
	ORGANIZATION_ALREADY_EXISTS: "সংস্থা ইতিমধ্যে বিদ্যমান",
	ORGANIZATION_SLUG_ALREADY_TAKEN: "সংস্থার স্ল্যাগ ইতিমধ্যে নেওয়া হয়েছে",
	ORGANIZATION_NOT_FOUND: "সংস্থা পাওয়া যায়নি",
	USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION: "ব্যবহারকারী সংস্থার সদস্য নন",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
		"আপনাকে এই সংস্থা আপডেট করার অনুমতি দেওয়া হয়নি",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
		"আপনাকে এই সংস্থাটি মুছে ফেলার অনুমতি দেওয়া হয়নি",
	NO_ACTIVE_ORGANIZATION: "কোনো সক্রিয় সংস্থা নেই",
	USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
		"ব্যবহারকারী ইতিমধ্যে এই সংস্থার সদস্য",
	MEMBER_NOT_FOUND: "সদস্য পাওয়া যায়নি",
	ROLE_NOT_FOUND: "ভূমিকা পাওয়া যায়নি",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
		"আপনাকে একটি নতুন দল তৈরি করার অনুমতি দেওয়া হয়নি",
	TEAM_ALREADY_EXISTS: "দল ইতিমধ্যে বিদ্যমান",
	TEAM_NOT_FOUND: "দল পাওয়া যায়নি",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
		"আপনি একমাত্র মালিক হিসাবে সংস্থাটি ছেড়ে যেতে পারবেন না",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
		"আপনি একজন মালিক ছাড়া সংস্থাটি ছেড়ে যেতে পারবেন না",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
		"আপনাকে এই সদস্যকে মুছে ফেলার অনুমতি দেওয়া হয়নি",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
		"আপনাকে এই সংস্থায় ব্যবহারকারীদের আমন্ত্রণ জানানোর অনুমতি দেওয়া হয়নি",
	USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
		"ব্যবহারকারী ইতিমধ্যে এই সংস্থায় আমন্ত্রিত",
	INVITATION_NOT_FOUND: "আমন্ত্রণ পাওয়া যায়নি",
	YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: "আপনি আমন্ত্রণের প্রাপক নন",
	EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
		"আমন্ত্রণ গ্রহণ বা প্রত্যাখ্যান করার আগে ইমেল যাচাইকরণ প্রয়োজন",
	EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
		"সেশন ইমেলের জন্য আমন্ত্রণগুলি দেখতে বা তালিকাভুক্ত করতে ইমেল যাচাইকরণ প্রয়োজন",
	YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
		"আপনাকে এই আমন্ত্রণ বাতিল করার অনুমতি দেওয়া হয়নি",
	INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
		"আমন্ত্রণকারী আর সংস্থার সদস্য নন",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
		"আপনাকে এই ভূমিকা সহ ব্যবহারকারীকে আমন্ত্রণ জানানোর অনুমতি দেওয়া হয়নি",
	FAILED_TO_RETRIEVE_INVITATION: "আমন্ত্রণ পুনরুদ্ধার করতে ব্যর্থ",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
		"আপনি দলের সর্বাধিক সংখ্যায় পৌঁছেছেন",
	UNABLE_TO_REMOVE_LAST_TEAM: "শেষ দলটি সরাতে অক্ষম",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
		"আপনাকে এই সদস্যকে আপডেট করার অনুমতি দেওয়া হয়নি",
	ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: "সংস্থার সদস্যতার সীমায় পৌঁছে গেছেন",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
		"আপনাকে এই সংস্থায় দল তৈরি করার অনুমতি দেওয়া হয়নি",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
		"আপনাকে এই সংস্থায় দল মুছে ফেলার অনুমতি দেওয়া হয়নি",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
		"আপনাকে এই দল আপডেট করার অনুমতি দেওয়া হয়নি",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
		"আপনাকে এই দল মুছে ফেলার অনুমতি দেওয়া হয়নি",
	INVITATION_LIMIT_REACHED: "আমন্ত্রণের সীমায় পৌঁছে গেছেন",
	TEAM_MEMBER_LIMIT_REACHED: "দলের সদস্য সংখ্যার সীমায় পৌঁছে গেছেন",
	USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "ব্যবহারকারী দলের সদস্য নন",
	YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
		"আপনাকে এই দলের সদস্যদের তালিকাভুক্ত করার অনুমতি দেওয়া হয়নি",
	YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "আপনার কোনো সক্রিয় দল নেই",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
		"আপনাকে একজন নতুন সদস্য তৈরি করার অনুমতি দেওয়া হয়নি",
	YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
		"আপনাকে দলের সদস্য সরাতে অনুমতি দেওয়া হয়নি",
	YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
		"মালিক হিসাবে আপনার এই সংস্থায় অ্যাক্সেস করার অনুমতি নেই",
	YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION: "আপনি এই সংস্থার সদস্য নন",
	MISSING_AC_INSTANCE:
		"ডায়নামিক অ্যাক্সেস কন্ট্রোলের জন্য সার্ভার প্লাগইনে একটি পূর্ব-সংজ্ঞায়িত ac ইনস্ট্যান্স প্রয়োজন",
	YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
		"একটি ভূমিকা তৈরি করতে আপনাকে একটি সংস্থায় থাকতে হবে",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "আপনাকে ভূমিকা তৈরি করার অনুমতি দেওয়া হয়নি",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE: "আপনাকে ভূমিকা আপডেট করার অনুমতি দেওয়া হয়নি",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "আপনাকে ভূমিকা মুছে ফেলার অনুমতি দেওয়া হয়নি",
	YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "আপনাকে ভূমিকা পড়ার অনুমতি দেওয়া হয়নি",
	YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE: "আপনাকে ভূমিকা তালিকাভুক্ত করার অনুমতি দেওয়া হয়নি",
	YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "আপনাকে ভূমিকা পাওয়ার অনুমতি দেওয়া হয়নি",
	TOO_MANY_ROLES: "এই সংস্থায় খুব বেশি ভূমিকা রয়েছে",
	INVALID_RESOURCE: "প্রদত্ত অনুমতিতে একটি অবৈধ সংস্থান অন্তর্ভুক্ত রয়েছে",
	ROLE_NAME_IS_ALREADY_TAKEN: "সেই ভূমিকার নামটি ইতিমধ্যে নেওয়া হয়েছে",
	CANNOT_DELETE_A_PRE_DEFINED_ROLE: "একটি পূর্ব-সংজ্ঞায়িত ভূমিকা মুছে ফেলা যাবে না",
	ROLE_IS_ASSIGNED_TO_MEMBERS:
		"সদস্যদের অর্পিত ভূমিকা মুছে ফেলা যাবে না। অনুগ্রহ করে প্রথমে সদস্যদের অন্য ভূমিকা দিন",
	INVALID_TEAM_ID: "দল আইডিতে একটি সংরক্ষিত অক্ষর রয়েছে",
};
