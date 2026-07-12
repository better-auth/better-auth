import type { ADMIN_ERROR_CODES } from "better-auth/plugins/admin";
import type { LocalizedTranslations } from "../../../types";

export const hiAdmin: LocalizedTranslations<typeof ADMIN_ERROR_CODES> = {
	FAILED_TO_CREATE_USER: "उपयोगकर्ता बनाने में विफल",
	USER_ALREADY_EXISTS: "उपयोगकर्ता पहले से मौजूद है।",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"उपयोगकर्ता पहले से मौजूद है। किसी अन्य ईमेल का उपयोग करें।",
	YOU_CANNOT_BAN_YOURSELF: "आप स्वयं को प्रतिबंधित नहीं कर सकते",
	YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
		"आपको उपयोगकर्ताओं की भूमिका बदलने की अनुमति नहीं है",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "आपको उपयोगकर्ता बनाने की अनुमति नहीं है",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS:
		"आपको उपयोगकर्ताओं को सूचीबद्ध करने की अनुमति नहीं है",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
		"आपको उपयोगकर्ता सत्रों को सूचीबद्ध करने की अनुमति नहीं है",
	YOU_ARE_NOT_ALLOWED_TO_BAN_USERS:
		"आपको उपयोगकर्ताओं को प्रतिबंधित करने की अनुमति नहीं है",
	YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
		"आपको उपयोगकर्ताओं का स्वांग रचने की अनुमति नहीं है",
	YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
		"आपको उपयोगकर्ता सत्रों को रद्द करने की अनुमति नहीं है",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: "आपको उपयोगकर्ताओं को हटाने की अनुमति नहीं है",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
		"आपको उपयोगकर्ताओं का पासवर्ड सेट करने की अनुमति नहीं है",
	BANNED_USER: "आपको इस एप्लिकेशन से प्रतिबंधित कर दिया गया है",
	YOU_ARE_NOT_ALLOWED_TO_GET_USER: "आपको उपयोगकर्ता प्राप्त करने की अनुमति नहीं है",
	NO_DATA_TO_UPDATE: "अपडेट करने के लिए कोई डेटा नहीं है",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
		"आपको उपयोगकर्ताओं को अपडेट करने की अनुमति नहीं है",
	YOU_CANNOT_REMOVE_YOURSELF: "आप स्वयं को हटा नहीं सकते",
	YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
		"आपको अस्तित्वहीन भूमिका मान सेट करने की अनुमति नहीं है",
	YOU_CANNOT_IMPERSONATE_ADMINS: "आप प्रशासकों का स्वांग नहीं रच सकते",
	INVALID_ROLE_TYPE: "अमान्य भूमिका प्रकार",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
		"आपको उपयोगकर्ताओं का ईमेल अपडेट करने की अनुमति नहीं है",
	PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
		"उपयोगकर्ता अपडेट के माध्यम से पासवर्ड अपडेट नहीं किया जा सकता है। इसके बजाय सेट-यूज़र-पासवर्ड एंडपॉइंट का उपयोग करें",
};
