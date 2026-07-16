import type { TranslationDictionary } from "../types";
import { jaCore } from "./core/ja";
import { jaAdmin } from "./plugins/admin/ja";
import { jaAnonymous } from "./plugins/anonymous/ja";
import { jaApiKey } from "./plugins/api-key/ja";
import { jaCaptcha } from "./plugins/captcha/ja";
import { jaDeviceAuthorization } from "./plugins/device-authorization/ja";
import { jaElectron } from "./plugins/electron/ja";
import { jaEmailOtp } from "./plugins/email-otp/ja";
import { jaGenericOAuth } from "./plugins/generic-oauth/ja";
import { jaHaveIBeenPwned } from "./plugins/haveibeenpwned/ja";
import { jaMultiSession } from "./plugins/multi-session/ja";
import { jaOauthPopup } from "./plugins/oauth-popup/ja";
import { jaOrganization } from "./plugins/organization/ja";
import { jaPasskey } from "./plugins/passkey/ja";
import { jaPhoneNumber } from "./plugins/phone-number/ja";
import { jaSso } from "./plugins/sso/ja";
import { jaStripe } from "./plugins/stripe/ja";
import { jaTwoFactor } from "./plugins/two-factor/ja";
import { jaUsername } from "./plugins/username/ja";

export const ja: TranslationDictionary = {
	...jaCore,
	...jaUsername,
	...jaSso,
	...jaDeviceAuthorization,
	...jaOauthPopup,
	...jaOrganization,
	...jaEmailOtp,
	...jaApiKey,
	...jaElectron,
	...jaHaveIBeenPwned,
	...jaStripe,
	...jaMultiSession,
	...jaAdmin,
	...jaAnonymous,
	...jaCaptcha,
	...jaPasskey,
	...jaTwoFactor,
	...jaPhoneNumber,
	...jaGenericOAuth,
};
