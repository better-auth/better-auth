import type { TranslationDictionary } from "../types";
import { nlCore } from "./core/nl";
import { nlAdmin } from "./plugins/admin/nl";
import { nlAnonymous } from "./plugins/anonymous/nl";
import { nlApiKey } from "./plugins/api-key/nl";
import { nlCaptcha } from "./plugins/captcha/nl";
import { nlDeviceAuthorization } from "./plugins/device-authorization/nl";
import { nlElectron } from "./plugins/electron/nl";
import { nlEmailOtp } from "./plugins/email-otp/nl";
import { nlGenericOAuth } from "./plugins/generic-oauth/nl";
import { nlHaveIBeenPwned } from "./plugins/haveibeenpwned/nl";
import { nlMultiSession } from "./plugins/multi-session/nl";
import { nlOauthPopup } from "./plugins/oauth-popup/nl";
import { nlOrganization } from "./plugins/organization/nl";
import { nlPasskey } from "./plugins/passkey/nl";
import { nlPhoneNumber } from "./plugins/phone-number/nl";
import { nlSso } from "./plugins/sso/nl";
import { nlStripe } from "./plugins/stripe/nl";
import { nlTwoFactor } from "./plugins/two-factor/nl";
import { nlUsername } from "./plugins/username/nl";

export const nl: TranslationDictionary = {
	...nlCore,
	...nlUsername,
	...nlSso,
	...nlDeviceAuthorization,
	...nlOauthPopup,
	...nlOrganization,
	...nlEmailOtp,
	...nlApiKey,
	...nlElectron,
	...nlHaveIBeenPwned,
	...nlStripe,
	...nlMultiSession,
	...nlAdmin,
	...nlAnonymous,
	...nlCaptcha,
	...nlPasskey,
	...nlTwoFactor,
	...nlPhoneNumber,
	...nlGenericOAuth,
};
