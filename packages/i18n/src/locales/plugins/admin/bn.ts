import type { ADMIN_ERROR_CODES } from "better-auth/plugins/admin";
import type { LocalizedTranslations } from "../../../types";

export const bnAdmin: LocalizedTranslations<typeof ADMIN_ERROR_CODES> = {
	FAILED_TO_CREATE_USER: "ব্যবহারকারী তৈরি করতে ব্যর্থ",
	USER_ALREADY_EXISTS: "ব্যবহারকারী ইতিমধ্যে বিদ্যমান।",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"ব্যবহারকারী ইতিমধ্যে বিদ্যমান। অন্য ইমেল ব্যবহার করুন।",
	YOU_CANNOT_BAN_YOURSELF: "আপনি নিজেকে নিষিদ্ধ করতে পারবেন না",
	YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
		"আপনাকে ব্যবহারকারীদের ভূমিকা পরিবর্তন করার অনুমতি দেওয়া হয়নি",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS:
		"আপনাকে ব্যবহারকারী তৈরি করার অনুমতি দেওয়া হয়নি",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS:
		"আপনাকে ব্যবহারকারীদের তালিকাভুক্ত করার অনুমতি দেওয়া হয়নি",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
		"আপনাকে ব্যবহারকারীদের সেশন তালিকাভুক্ত করার অনুমতি দেওয়া হয়নি",
	YOU_ARE_NOT_ALLOWED_TO_BAN_USERS:
		"আপনাকে ব্যবহারকারীদের নিষিদ্ধ করার অনুমতি দেওয়া হয়নি",
	YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
		"আপনাকে ব্যবহারকারীদের ছদ্মবেশ ধারণ করার অনুমতি দেওয়া হয়নি",
	YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
		"আপনাকে ব্যবহারকারীদের সেশন প্রত্যাহার করার অনুমতি দেওয়া হয়নি",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS:
		"আপনাকে ব্যবহারকারীদের মুছে ফেলার অনুমতি দেওয়া হয়নি",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
		"আপনাকে ব্যবহারকারীদের পাসওয়ার্ড সেট করার অনুমতি দেওয়া হয়নি",
	BANNED_USER: "আপনাকে এই অ্যাপ্লিকেশন থেকে নিষিদ্ধ করা হয়েছে",
	YOU_ARE_NOT_ALLOWED_TO_GET_USER: "আপনাকে ব্যবহারকারী পাওয়ার অনুমতি দেওয়া হয়নি",
	NO_DATA_TO_UPDATE: "আপডেট করার জন্য কোনো তথ্য নেই",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
		"আপনাকে ব্যবহারকারীদের আপডেট করার অনুমতি দেওয়া হয়নি",
	YOU_CANNOT_REMOVE_YOURSELF: "আপনি নিজেকে সরাতে পারবেন না",
	YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
		"আপনাকে অস্তিত্বহীন ভূমিকা মান সেট করার অনুমতি দেওয়া হয়নি",
	YOU_CANNOT_IMPERSONATE_ADMINS: "আপনি অ্যাডমিনদের ছদ্মবেশ ধারণ করতে পারবেন না",
	INVALID_ROLE_TYPE: "অবৈধ ভূমিকা প্রকার",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
		"আপনাকে ব্যবহারকারীদের ইমেল আপডেট করার অনুমতি দেওয়া হয়নি",
	PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
		"আপডেট-ইউজারের মাধ্যমে পাসওয়ার্ড আপডেট করা যাবে না। পরিবর্তে সেট-ইউজার-পাসওয়ার্ড এন্ডপয়েন্ট ব্যবহার করুন",
};
