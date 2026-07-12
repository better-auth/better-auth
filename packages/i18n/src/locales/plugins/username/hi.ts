import type { USERNAME_ERROR_CODES } from "better-auth/plugins/username";
import type { LocalizedTranslations } from "../../../types";

export const hiUsername: LocalizedTranslations<typeof USERNAME_ERROR_CODES> = {
	INVALID_USERNAME_OR_PASSWORD: "अमान्य उपयोगकर्ता नाम या पासवर्ड",
	EMAIL_NOT_VERIFIED: "ईमेल सत्यापित नहीं है",
	UNEXPECTED_ERROR: "अप्रत्याशित त्रुटि",
	USERNAME_IS_ALREADY_TAKEN:
		"उपयोगकर्ता नाम पहले से ही लिया जा चुका है। कृपया दूसरा प्रयास करें।",
	USERNAME_TOO_SHORT: "उपयोगकर्ता नाम बहुत छोटा है",
	USERNAME_TOO_LONG: "उपयोगकर्ता नाम बहुत लंबा है",
	INVALID_USERNAME: "उपयोगकर्ता नाम अमान्य है",
	INVALID_DISPLAY_USERNAME: "प्रदर्शन नाम अमान्य है",
	USERNAME_IS_IMMUTABLE: "उपयोगकर्ता नाम अपडेट नहीं किया जा सकता",
};
