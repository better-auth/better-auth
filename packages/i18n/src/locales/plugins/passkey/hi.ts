import type { PASSKEY_ERROR_CODES } from "@better-auth/passkey";
import type { LocalizedTranslations } from "../../../types";

export const hiPasskey: LocalizedTranslations<typeof PASSKEY_ERROR_CODES> = {
	CHALLENGE_NOT_FOUND: "चुनौती नहीं मिली",
	YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
		"आपको इस पासकी को पंजीकृत करने की अनुमति नहीं है",
	FAILED_TO_VERIFY_REGISTRATION: "पंजीकरण सत्यापित करने में विफल",
	PASSKEY_NOT_FOUND: "पासकी नहीं मिली",
	AUTHENTICATION_FAILED: "प्रमाणीकरण विफल",
	UNABLE_TO_CREATE_SESSION: "सत्र बनाने में असमर्थ",
	FAILED_TO_UPDATE_PASSKEY: "पासकी अपडेट करने में विफल",
	PREVIOUSLY_REGISTERED: "पहले से पंजीकृत",
	REGISTRATION_CANCELLED: "पंजीकरण रद्द कर दिया गया",
	AUTH_CANCELLED: "प्रमाणीकरण रद्द कर दिया गया",
	UNKNOWN_ERROR: "अज्ञात त्रुटि",
	SESSION_REQUIRED: "पासकी पंजीकरण के लिए एक प्रमाणित सत्र की आवश्यकता होती है",
	RESOLVE_USER_REQUIRED:
		"जब requireSession गलत हो तो पासकी पंजीकरण के लिए या तो एक प्रमाणित सत्र या resolveUser कॉलबैक की आवश्यकता होती है",
	RESOLVED_USER_INVALID: "समाधान किया गया उपयोगकर्ता अमान्य है",
};
