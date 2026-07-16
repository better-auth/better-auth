import type { TranslationDictionary } from "../types";
import { ukCore } from "./core/uk";
import { ukAdmin } from "./plugins/admin/uk";
import { ukAnonymous } from "./plugins/anonymous/uk";
import { ukApiKey } from "./plugins/api-key/uk";
import { ukCaptcha } from "./plugins/captcha/uk";
import { ukDeviceAuthorization } from "./plugins/device-authorization/uk";
import { ukElectron } from "./plugins/electron/uk";
import { ukEmailOtp } from "./plugins/email-otp/uk";
import { ukGenericOAuth } from "./plugins/generic-oauth/uk";
import { ukHaveIBeenPwned } from "./plugins/haveibeenpwned/uk";
import { ukMultiSession } from "./plugins/multi-session/uk";
import { ukOauthPopup } from "./plugins/oauth-popup/uk";
import { ukOrganization } from "./plugins/organization/uk";
import { ukPasskey } from "./plugins/passkey/uk";
import { ukPhoneNumber } from "./plugins/phone-number/uk";
import { ukSso } from "./plugins/sso/uk";
import { ukStripe } from "./plugins/stripe/uk";
import { ukTwoFactor } from "./plugins/two-factor/uk";
import { ukUsername } from "./plugins/username/uk";

export const uk: TranslationDictionary = {
	...ukCore,
	...ukUsername,
	...ukSso,
	...ukDeviceAuthorization,
	...ukOauthPopup,
	...ukOrganization,
	...ukEmailOtp,
	...ukApiKey,
	...ukElectron,
	...ukHaveIBeenPwned,
	...ukStripe,
	...ukMultiSession,
	...ukAdmin,
	...ukAnonymous,
	...ukCaptcha,
	...ukPasskey,
	...ukTwoFactor,
	...ukPhoneNumber,
	...ukGenericOAuth,
};
