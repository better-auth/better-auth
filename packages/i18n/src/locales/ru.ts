import type { TranslationDictionary } from "../types";
import { ruCore } from "./core/ru";
import { ruAdmin } from "./plugins/admin/ru";
import { ruAnonymous } from "./plugins/anonymous/ru";
import { ruApiKey } from "./plugins/api-key/ru";
import { ruCaptcha } from "./plugins/captcha/ru";
import { ruDeviceAuthorization } from "./plugins/device-authorization/ru";
import { ruElectron } from "./plugins/electron/ru";
import { ruEmailOtp } from "./plugins/email-otp/ru";
import { ruGenericOAuth } from "./plugins/generic-oauth/ru";
import { ruHaveIBeenPwned } from "./plugins/haveibeenpwned/ru";
import { ruMultiSession } from "./plugins/multi-session/ru";
import { ruOauthPopup } from "./plugins/oauth-popup/ru";
import { ruOrganization } from "./plugins/organization/ru";
import { ruPasskey } from "./plugins/passkey/ru";
import { ruPhoneNumber } from "./plugins/phone-number/ru";
import { ruSso } from "./plugins/sso/ru";
import { ruStripe } from "./plugins/stripe/ru";
import { ruTwoFactor } from "./plugins/two-factor/ru";
import { ruUsername } from "./plugins/username/ru";

export const ru: TranslationDictionary = {
	...ruCore,
	...ruUsername,
	...ruSso,
	...ruDeviceAuthorization,
	...ruOauthPopup,
	...ruOrganization,
	...ruEmailOtp,
	...ruApiKey,
	...ruElectron,
	...ruHaveIBeenPwned,
	...ruStripe,
	...ruMultiSession,
	...ruAdmin,
	...ruAnonymous,
	...ruCaptcha,
	...ruPasskey,
	...ruTwoFactor,
	...ruPhoneNumber,
	...ruGenericOAuth,
};
