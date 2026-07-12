import type { DEVICE_AUTHORIZATION_ERROR_CODES } from "better-auth/plugins/device-authorization";
import type { LocalizedTranslations } from "../../../types";

export const hiDeviceAuthorization: LocalizedTranslations<
	typeof DEVICE_AUTHORIZATION_ERROR_CODES
> = {
	INVALID_DEVICE_CODE: "अमान्य डिवाइस कोड",
	EXPIRED_DEVICE_CODE: "डिवाइस कोड समाप्त हो गया है",
	EXPIRED_USER_CODE: "उपयोगकर्ता कोड समाप्त हो गया है",
	AUTHORIZATION_PENDING: "प्राधिकरण लंबित है",
	ACCESS_DENIED: "पहुंच अस्वीकृत",
	INVALID_USER_CODE: "अमान्य उपयोगकर्ता कोड",
	DEVICE_CODE_ALREADY_PROCESSED: "डिवाइस कोड पहले ही संसाधित हो चुका है",
	DEVICE_CODE_NOT_CLAIMED:
		"सत्यापन सत्र द्वारा डिवाइस कोड का दावा नहीं किया गया है; स्वीकृत या अस्वीकार करने से पहले साइन इन रहते हुए `user_code` के साथ `GET /device` कॉल करें",
	POLLING_TOO_FREQUENTLY: "बहुत बार-बार मतदान (पॉलिंग) किया जा रहा है",
	USER_NOT_FOUND: "उपयोगकर्ता नहीं मिला",
	FAILED_TO_CREATE_SESSION: "सत्र बनाने में विफल",
	INVALID_DEVICE_CODE_STATUS: "अमान्य डिवाइस कोड स्थिति",
	AUTHENTICATION_REQUIRED: "प्रमाणीकरण आवश्यक है",
};
