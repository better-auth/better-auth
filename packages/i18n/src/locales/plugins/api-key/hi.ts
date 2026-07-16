import type { API_KEY_ERROR_CODES } from "@better-auth/api-key";
import type { LocalizedTranslations } from "../../../types";

export const hiApiKey: LocalizedTranslations<typeof API_KEY_ERROR_CODES> = {
	INVALID_METADATA_TYPE: "मेटाडेटा एक ऑब्जेक्ट या अपरिभाषित होना चाहिए",
	REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
		"जब refillInterval प्रदान किया जाता है तो refillAmount आवश्यक है",
	REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
		"जब refillAmount प्रदान किया जाता है तो refillInterval आवश्यक है",
	USER_BANNED: "उपयोगकर्ता प्रतिबंधित है",
	UNAUTHORIZED_SESSION: "अनधिकृत या अमान्य सत्र",
	KEY_NOT_FOUND: "API कुंजी नहीं मिली",
	KEY_DISABLED: "API कुंजी अक्षम है",
	KEY_EXPIRED: "API कुंजी समाप्त हो गई है",
	USAGE_EXCEEDED: "API कुंजी अपनी उपयोग सीमा तक पहुँच गई है",
	KEY_NOT_RECOVERABLE: "API कुंजी पुनर्प्राप्त करने योग्य नहीं है",
	EXPIRES_IN_IS_TOO_SMALL: "expiresIn पूर्व-निर्धारित न्यूनतम मान से छोटा है।",
	EXPIRES_IN_IS_TOO_LARGE: "expiresIn पूर्व-निर्धारित अधिकतम मान से बड़ा है।",
	INVALID_REMAINING: "शेष गणना या तो बहुत बड़ी है या बहुत छोटी।",
	INVALID_PREFIX_LENGTH: "उपसर्ग की लंबाई या तो बहुत बड़ी है या बहुत छोटी।",
	INVALID_NAME_LENGTH: "नाम की लंबाई या तो बहुत बड़ी है या बहुत छोटी।",
	METADATA_DISABLED: "मेटाडेटा अक्षम है।",
	RATE_LIMIT_EXCEEDED: "दर सीमा पार हो गई।",
	NO_VALUES_TO_UPDATE: "अपडेट करने के लिए कोई मान नहीं।",
	KEY_DISABLED_EXPIRATION: "कस्टम कुंजी समाप्ति मान अक्षम हैं।",
	INVALID_API_KEY: "अमान्य API कुंजी।",
	INVALID_USER_ID_FROM_API_KEY: "API कुंजी से उपयोगकर्ता आईडी अमान्य है।",
	INVALID_REFERENCE_ID_FROM_API_KEY: "API कुंजी से संदर्भ आईडी अमान्य है।",
	INVALID_API_KEY_GETTER_RETURN_TYPE:
		"API कुंजी गेटर ने अमान्य कुंजी प्रकार लौटाया। स्ट्रिंग अपेक्षित।",
	SERVER_ONLY_PROPERTY:
		"आप जिस प्रॉपर्टी को सेट करने का प्रयास कर रहे हैं उसे केवल सर्वर ऑथ इंस्टेंस से ही सेट किया जा सकता है।",
	FAILED_TO_UPDATE_API_KEY: "API कुंजी अपडेट करने में विफल",
	NAME_REQUIRED: "API कुंजी का नाम आवश्यक है।",
	ORGANIZATION_ID_REQUIRED:
		"संगठन के स्वामित्व वाली API कुंजियों के लिए संगठन आईडी आवश्यक है।",
	USER_NOT_MEMBER_OF_ORGANIZATION:
		"आप उस संगठन के सदस्य नहीं हैं जिसके पास यह API कुंजी है।",
	INSUFFICIENT_API_KEY_PERMISSIONS:
		"आपके पास संगठन API कुंजियों पर यह कार्रवाई करने की अनुमति नहीं है।",
	NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
		"कोई डिफ़ॉल्ट API कुंजी कॉन्फ़िगरेशन नहीं मिला।",
	ORGANIZATION_PLUGIN_REQUIRED:
		"संगठन के स्वामित्व वाली API कुंजियों के लिए संगठन प्लगइन आवश्यक है। कृपया संगठन प्लगइन इंस्टॉल और कॉन्फ़िगर करें।",
};
