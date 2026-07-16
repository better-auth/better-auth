import type { TranslationDictionary } from "../types";
import { ptCore } from "./core/pt";
import { ptAdmin } from "./plugins/admin/pt";
import { ptAnonymous } from "./plugins/anonymous/pt";
import { ptApiKey } from "./plugins/api-key/pt";
import { ptCaptcha } from "./plugins/captcha/pt";
import { ptDeviceAuthorization } from "./plugins/device-authorization/pt";
import { ptElectron } from "./plugins/electron/pt";
import { ptEmailOtp } from "./plugins/email-otp/pt";
import { ptGenericOAuth } from "./plugins/generic-oauth/pt";
import { ptHaveIBeenPwned } from "./plugins/haveibeenpwned/pt";
import { ptMultiSession } from "./plugins/multi-session/pt";
import { ptOauthPopup } from "./plugins/oauth-popup/pt";
import { ptOrganization } from "./plugins/organization/pt";
import { ptPasskey } from "./plugins/passkey/pt";
import { ptPhoneNumber } from "./plugins/phone-number/pt";
import { ptSso } from "./plugins/sso/pt";
import { ptStripe } from "./plugins/stripe/pt";
import { ptTwoFactor } from "./plugins/two-factor/pt";
import { ptUsername } from "./plugins/username/pt";

export const pt: TranslationDictionary = {
	...ptCore,
	...ptUsername,
	...ptSso,
	...ptDeviceAuthorization,
	...ptOauthPopup,
	...ptOrganization,
	...ptEmailOtp,
	...ptApiKey,
	...ptElectron,
	...ptHaveIBeenPwned,
	...ptStripe,
	...ptMultiSession,
	...ptAdmin,
	...ptAnonymous,
	...ptCaptcha,
	...ptPasskey,
	...ptTwoFactor,
	...ptPhoneNumber,
	...ptGenericOAuth,
};
