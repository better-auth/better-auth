import type { TranslationDictionary } from "../types";
import { hiCore } from "./core/hi";
import { hiAdmin } from "./plugins/admin/hi";
import { hiAnonymous } from "./plugins/anonymous/hi";
import { hiApiKey } from "./plugins/api-key/hi";
import { hiCaptcha } from "./plugins/captcha/hi";
import { hiDeviceAuthorization } from "./plugins/device-authorization/hi";
import { hiElectron } from "./plugins/electron/hi";
import { hiEmailOtp } from "./plugins/email-otp/hi";
import { hiGenericOAuth } from "./plugins/generic-oauth/hi";
import { hiHaveIBeenPwned } from "./plugins/haveibeenpwned/hi";
import { hiMultiSession } from "./plugins/multi-session/hi";
import { hiOauthPopup } from "./plugins/oauth-popup/hi";
import { hiOrganization } from "./plugins/organization/hi";
import { hiPasskey } from "./plugins/passkey/hi";
import { hiPhoneNumber } from "./plugins/phone-number/hi";
import { hiSso } from "./plugins/sso/hi";
import { hiStripe } from "./plugins/stripe/hi";
import { hiTwoFactor } from "./plugins/two-factor/hi";
import { hiUsername } from "./plugins/username/hi";

export const hi: TranslationDictionary = {
	...hiCore,
	...hiUsername,
	...hiSso,
	...hiDeviceAuthorization,
	...hiOauthPopup,
	...hiOrganization,
	...hiEmailOtp,
	...hiApiKey,
	...hiElectron,
	...hiHaveIBeenPwned,
	...hiStripe,
	...hiMultiSession,
	...hiAdmin,
	...hiAnonymous,
	...hiCaptcha,
	...hiPasskey,
	...hiTwoFactor,
	...hiPhoneNumber,
	...hiGenericOAuth,
};
