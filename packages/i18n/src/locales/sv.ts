import type { TranslationDictionary } from "../types";
import { svCore } from "./core/sv";
import { svAdmin } from "./plugins/admin/sv";
import { svAnonymous } from "./plugins/anonymous/sv";
import { svApiKey } from "./plugins/api-key/sv";
import { svCaptcha } from "./plugins/captcha/sv";
import { svDeviceAuthorization } from "./plugins/device-authorization/sv";
import { svElectron } from "./plugins/electron/sv";
import { svEmailOtp } from "./plugins/email-otp/sv";
import { svGenericOAuth } from "./plugins/generic-oauth/sv";
import { svHaveIBeenPwned } from "./plugins/haveibeenpwned/sv";
import { svMultiSession } from "./plugins/multi-session/sv";
import { svOauthPopup } from "./plugins/oauth-popup/sv";
import { svOrganization } from "./plugins/organization/sv";
import { svPasskey } from "./plugins/passkey/sv";
import { svPhoneNumber } from "./plugins/phone-number/sv";
import { svSso } from "./plugins/sso/sv";
import { svStripe } from "./plugins/stripe/sv";
import { svTwoFactor } from "./plugins/two-factor/sv";
import { svUsername } from "./plugins/username/sv";

export const sv: TranslationDictionary = {
	...svCore,
	...svUsername,
	...svSso,
	...svDeviceAuthorization,
	...svOauthPopup,
	...svOrganization,
	...svEmailOtp,
	...svApiKey,
	...svElectron,
	...svHaveIBeenPwned,
	...svStripe,
	...svMultiSession,
	...svAdmin,
	...svAnonymous,
	...svCaptcha,
	...svPasskey,
	...svTwoFactor,
	...svPhoneNumber,
	...svGenericOAuth,
};
