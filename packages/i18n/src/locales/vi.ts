import type { TranslationDictionary } from "../types";
import { viCore } from "./core/vi";
import { viAdmin } from "./plugins/admin/vi";
import { viAnonymous } from "./plugins/anonymous/vi";
import { viApiKey } from "./plugins/api-key/vi";
import { viCaptcha } from "./plugins/captcha/vi";
import { viDeviceAuthorization } from "./plugins/device-authorization/vi";
import { viElectron } from "./plugins/electron/vi";
import { viEmailOtp } from "./plugins/email-otp/vi";
import { viGenericOAuth } from "./plugins/generic-oauth/vi";
import { viHaveIBeenPwned } from "./plugins/haveibeenpwned/vi";
import { viMultiSession } from "./plugins/multi-session/vi";
import { viOauthPopup } from "./plugins/oauth-popup/vi";
import { viOrganization } from "./plugins/organization/vi";
import { viPasskey } from "./plugins/passkey/vi";
import { viPhoneNumber } from "./plugins/phone-number/vi";
import { viSso } from "./plugins/sso/vi";
import { viStripe } from "./plugins/stripe/vi";
import { viTwoFactor } from "./plugins/two-factor/vi";
import { viUsername } from "./plugins/username/vi";

export const vi: TranslationDictionary = {
	...viCore,
	...viUsername,
	...viSso,
	...viDeviceAuthorization,
	...viOauthPopup,
	...viOrganization,
	...viEmailOtp,
	...viApiKey,
	...viElectron,
	...viHaveIBeenPwned,
	...viStripe,
	...viMultiSession,
	...viAdmin,
	...viAnonymous,
	...viCaptcha,
	...viPasskey,
	...viTwoFactor,
	...viPhoneNumber,
	...viGenericOAuth,
};
