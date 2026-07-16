import type { SAML_ERROR_CODES } from "@better-auth/sso";
import type { LocalizedTranslations } from "../../../types";

export const hiSso: LocalizedTranslations<typeof SAML_ERROR_CODES> = {
	SINGLE_LOGOUT_NOT_ENABLED: "सिंगल लॉगआउट सक्षम नहीं है",
	INVALID_LOGOUT_RESPONSE: "अमान्य लॉगआउट रिस्पॉन्स (LogoutResponse)",
	INVALID_LOGOUT_REQUEST: "अमान्य लॉगआउट रिक्वेस्ट (LogoutRequest)",
	LOGOUT_FAILED_AT_IDP: "IdP पर लॉगआउट विफल रहा",
	IDP_SLO_NOT_SUPPORTED: "IdP सिंगल लॉगआउट सेवा का समर्थन नहीं करता है",
	SAML_PROVIDER_NOT_FOUND: "SAML प्रदाता नहीं मिला",
	CERT_SOURCE_MISSING:
		"samlConfig के लिए हस्ताक्षर प्रमाणपत्र (cert या idpMetadata.cert) या idpMetadata.metadata XML दस्तावेज़ की आवश्यकता होती है।",
};
