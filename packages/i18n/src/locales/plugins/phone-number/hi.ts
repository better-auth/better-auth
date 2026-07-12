import type { PHONE_NUMBER_ERROR_CODES } from "better-auth/plugins/phone-number";
import type { LocalizedTranslations } from "../../../types";

export const hiPhoneNumber: LocalizedTranslations<
	typeof PHONE_NUMBER_ERROR_CODES
> = {
	INVALID_PHONE_NUMBER: "अमान्य फ़ोन नंबर",
	PHONE_NUMBER_EXIST: "यह फ़ोन नंबर पहले से मौजूद है",
	PHONE_NUMBER_NOT_EXIST: "यह फ़ोन नंबर पंजीकृत नहीं है",
	INVALID_PHONE_NUMBER_OR_PASSWORD: "अमान्य फ़ोन नंबर या पासवर्ड",
	UNEXPECTED_ERROR: "अप्रत्याशित त्रुटि",
	OTP_NOT_FOUND: "OTP नहीं मिला",
	OTP_EXPIRED: "OTP समाप्त हो गया है",
	INVALID_OTP: "अमान्य OTP",
	PHONE_NUMBER_NOT_VERIFIED: "फ़ोन नंबर सत्यापित नहीं है",
	PHONE_NUMBER_CANNOT_BE_UPDATED: "फ़ोन नंबर अपडेट नहीं किया जा सकता",
	SEND_OTP_NOT_IMPLEMENTED: "sendOTP लागू नहीं किया गया है",
	TOO_MANY_ATTEMPTS: "बहुत अधिक प्रयास। कृपया बाद में पुनः प्रयास करें।",
};
