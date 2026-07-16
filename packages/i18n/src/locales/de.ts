import type { TranslationDictionary } from "../types";
import { deCore } from "./core/de";
import { deAdmin } from "./plugins/admin/de";
import { deAnonymous } from "./plugins/anonymous/de";
import { deApiKey } from "./plugins/api-key/de";
import { deCaptcha } from "./plugins/captcha/de";
import { deDeviceAuthorization } from "./plugins/device-authorization/de";
import { deElectron } from "./plugins/electron/de";
import { deEmailOtp } from "./plugins/email-otp/de";
import { deGenericOAuth } from "./plugins/generic-oauth/de";
import { deHaveIBeenPwned } from "./plugins/haveibeenpwned/de";
import { deMultiSession } from "./plugins/multi-session/de";
import { deOauthPopup } from "./plugins/oauth-popup/de";
import { deOrganization } from "./plugins/organization/de";
import { dePasskey } from "./plugins/passkey/de";
import { dePhoneNumber } from "./plugins/phone-number/de";
import { deSso } from "./plugins/sso/de";
import { deStripe } from "./plugins/stripe/de";
import { deTwoFactor } from "./plugins/two-factor/de";
import { deUsername } from "./plugins/username/de";

export const de: TranslationDictionary = {
	...deCore,
	...deUsername,
	...deSso,
	...deDeviceAuthorization,
	...deOauthPopup,
	...deOrganization,
	...deEmailOtp,
	...deApiKey,
	...deElectron,
	...deHaveIBeenPwned,
	...deStripe,
	...deMultiSession,
	...deAdmin,
	...deAnonymous,
	...deCaptcha,
	...dePasskey,
	...deTwoFactor,
	...dePhoneNumber,
	...deGenericOAuth,
};
