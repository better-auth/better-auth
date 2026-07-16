import type { STRIPE_ERROR_CODES } from "@better-auth/stripe";
import type { LocalizedTranslations } from "../../../types";

export const hiStripe: LocalizedTranslations<typeof STRIPE_ERROR_CODES> = {
	UNAUTHORIZED: "अनधिकृत पहुंच",
	INVALID_REQUEST_BODY: "अमान्य अनुरोध निकाय",
	SUBSCRIPTION_NOT_FOUND: "सदस्यता नहीं मिली",
	SUBSCRIPTION_PLAN_NOT_FOUND: "सदस्यता योजना नहीं मिली",
	ALREADY_SUBSCRIBED_PLAN: "आपने पहले से ही इस योजना की सदस्यता ले रखी है",
	REFERENCE_ID_NOT_ALLOWED: "संदर्भ आईडी की अनुमति नहीं है",
	CUSTOMER_NOT_FOUND: "इस उपयोगकर्ता के लिए स्ट्राइप ग्राहक नहीं मिला",
	UNABLE_TO_CREATE_CUSTOMER: "ग्राहक बनाने में असमर्थ",
	UNABLE_TO_CREATE_BILLING_PORTAL: "बिलिंग पोर्टल सत्र बनाने में असमर्थ",
	STRIPE_SIGNATURE_NOT_FOUND: "स्ट्राइप हस्ताक्षर नहीं मिला",
	STRIPE_WEBHOOK_SECRET_NOT_FOUND: "स्ट्राइप वेबहुक गुप्त नहीं मिला",
	STRIPE_WEBHOOK_ERROR: "स्ट्राइप वेबहुक त्रुटि",
	FAILED_TO_CONSTRUCT_STRIPE_EVENT: "स्ट्राइप इवेंट बनाने में विफल",
	FAILED_TO_FETCH_PLANS: "योजनाएं प्राप्त करने में विफल",
	EMAIL_VERIFICATION_REQUIRED: "योजना की सदस्यता लेने से पहले ईमेल सत्यापन आवश्यक है",
	SUBSCRIPTION_NOT_ACTIVE: "सदस्यता सक्रिय नहीं है",
	SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
		"सदस्यता रद्द करने के लिए निर्धारित नहीं है",
	SUBSCRIPTION_NOT_PENDING_CHANGE:
		"सदस्यता में कोई लंबित रद्दीकरण या निर्धारित योजना परिवर्तन नहीं है",
	ORGANIZATION_NOT_FOUND: "संगठन नहीं मिला",
	ORGANIZATION_SUBSCRIPTION_NOT_ENABLED: "संगठन सदस्यता सक्षम नहीं है",
	AUTHORIZE_REFERENCE_REQUIRED:
		"संगठन सदस्यताओं के लिए authorizeReference कॉलबैक कॉन्फ़िगर करना आवश्यक है",
	ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
		"सक्रिय सदस्यता वाले संगठन को हटाया नहीं जा सकता",
	ORGANIZATION_REFERENCE_ID_REQUIRED:
		"संदर्भ आईडी आवश्यक है। referenceId प्रदान करें या सत्र में activeOrganizationId सेट करें",
};
