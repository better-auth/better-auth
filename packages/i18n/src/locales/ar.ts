import type { TranslationDictionary } from "../types";
import { arCore } from "./core/ar";
import { arAdmin } from "./plugins/admin/ar";
import { arAnonymous } from "./plugins/anonymous/ar";
import { arApiKey } from "./plugins/api-key/ar";
import { arCaptcha } from "./plugins/captcha/ar";
import { arDeviceAuthorization } from "./plugins/device-authorization/ar";
import { arElectron } from "./plugins/electron/ar";
import { arEmailOtp } from "./plugins/email-otp/ar";
import { arGenericOAuth } from "./plugins/generic-oauth/ar";
import { arHaveIBeenPwned } from "./plugins/haveibeenpwned/ar";
import { arMultiSession } from "./plugins/multi-session/ar";
import { arOauthPopup } from "./plugins/oauth-popup/ar";
import { arOrganization } from "./plugins/organization/ar";
import { arPasskey } from "./plugins/passkey/ar";
import { arPhoneNumber } from "./plugins/phone-number/ar";
import { arSso } from "./plugins/sso/ar";
import { arStripe } from "./plugins/stripe/ar";
import { arTwoFactor } from "./plugins/two-factor/ar";
import { arUsername } from "./plugins/username/ar";

export const ar: TranslationDictionary = {
	...arCore,
	...arUsername,
	...arSso,
	...arDeviceAuthorization,
	...arOauthPopup,
	...arOrganization,
	...arEmailOtp,
	...arApiKey,
	...arElectron,
	...arHaveIBeenPwned,
	...arStripe,
	...arMultiSession,
	...arAdmin,
	...arAnonymous,
	...arCaptcha,
	...arPasskey,
	...arTwoFactor,
	...arPhoneNumber,
	...arGenericOAuth,
};
