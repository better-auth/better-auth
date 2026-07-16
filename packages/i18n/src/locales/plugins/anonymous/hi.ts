import type { ANONYMOUS_ERROR_CODES } from "better-auth/plugins/anonymous";
import type { LocalizedTranslations } from "../../../types";

export const hiAnonymous: LocalizedTranslations<typeof ANONYMOUS_ERROR_CODES> =
	{
		INVALID_EMAIL_FORMAT: "ईमेल वैध प्रारूप में जनरेट नहीं किया गया था",
		FAILED_TO_CREATE_USER: "उपयोगकर्ता बनाने में विफल",
		COULD_NOT_CREATE_SESSION: "सत्र नहीं बनाया जा सका",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"अनाम उपयोगकर्ता फिर से गुमनाम रूप से साइन इन नहीं कर सकते",
		FAILED_TO_DELETE_ANONYMOUS_USER: "अनाम उपयोगकर्ता को हटाने में विफल",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"अनाम उपयोगकर्ता सत्रों को हटाने में विफल",
		USER_IS_NOT_ANONYMOUS: "उपयोगकर्ता अनाम नहीं है",
		DELETE_ANONYMOUS_USER_DISABLED: "अनाम उपयोगकर्ताओं को हटाना अक्षम है",
	};
