import type { SAML_ERROR_CODES } from "@better-auth/sso";
import type { LocalizedTranslations } from "../../../types";

export const bnSso: LocalizedTranslations<typeof SAML_ERROR_CODES> = {
	SINGLE_LOGOUT_NOT_ENABLED: "সিঙ্গেল লগআউট সক্রিয় করা নেই",
	INVALID_LOGOUT_RESPONSE: "অবৈধ LogoutResponse",
	INVALID_LOGOUT_REQUEST: "অবৈধ LogoutRequest",
	LOGOUT_FAILED_AT_IDP: "IdP-তে লগআউট ব্যর্থ হয়েছে",
	IDP_SLO_NOT_SUPPORTED: "IdP সিঙ্গেল লগআউট সার্ভিস সমর্থন করে না",
	SAML_PROVIDER_NOT_FOUND: "SAML প্রোভাইডার পাওয়া যায়নি",
	CERT_SOURCE_MISSING:
		"samlConfig-এর জন্য একটি সাইনিং সার্টিফিকেট (cert বা idpMetadata.cert) অথবা একটি idpMetadata.metadata XML ডকুমেন্ট প্রয়োজন।",
};
