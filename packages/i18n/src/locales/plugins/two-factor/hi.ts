import type { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins/two-factor";
import type { LocalizedTranslations } from "../../../types";

export const hiTwoFactor: LocalizedTranslations<typeof TWO_FACTOR_ERROR_CODES> =
	{
		OTP_NOT_ENABLED: "OTP सक्षम नहीं है",
		OTP_NOT_CONFIGURED: "OTP कॉन्फ़िगर नहीं है",
		OTP_HAS_EXPIRED: "OTP की समय सीमा समाप्त हो गई है",
		TOTP_NOT_ENABLED: "TOTP सक्षम नहीं है",
		TOTP_NOT_CONFIGURED: "TOTP कॉन्फ़िगर नहीं है",
		TWO_FACTOR_NOT_ENABLED: "दो-कारक प्रमाणीकरण सक्षम नहीं है",
		BACKUP_CODES_NOT_ENABLED: "बैकअप कोड सक्षम नहीं हैं",
		INVALID_BACKUP_CODE: "बैकअप कोड अमान्य है या पहले ही उपयोग किया जा चुका है।",
		INVALID_CODE: "आपने जो कोड दर्ज किया वह अमान्य है। कृपया जाँचें और पुनः प्रयास करें।",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"बहुत अधिक प्रयास। कृपया नया कोड अनुरोध करें।",
		ACCOUNT_TEMPORARILY_LOCKED:
			"बहुत अधिक सत्यापन विफलताएं। आपका खाता अस्थायी रूप से लॉक है। कृपया बाद में पुनः प्रयास करें।",
		INVALID_TWO_FACTOR_COOKIE: "दो-कारक प्रमाणीकरण कुकी अमान्य है",
	};
