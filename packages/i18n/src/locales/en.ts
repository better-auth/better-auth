import type { TranslationDictionary } from "../types";
import { enCore } from "./core/en";
import { enAdmin } from "./plugins/admin/en";
import { enAnonymous } from "./plugins/anonymous/en";
import { enApiKey } from "./plugins/api-key/en";
import { enCaptcha } from "./plugins/captcha/en";
import { enDeviceAuthorization } from "./plugins/device-authorization/en";
import { enElectron } from "./plugins/electron/en";
import { enEmailOtp } from "./plugins/email-otp/en";
import { enGenericOAuth } from "./plugins/generic-oauth/en";
import { enHaveIBeenPwned } from "./plugins/haveibeenpwned/en";
import { enMultiSession } from "./plugins/multi-session/en";
import { enOauthPopup } from "./plugins/oauth-popup/en";
import { enOrganization } from "./plugins/organization/en";
import { enPasskey } from "./plugins/passkey/en";
import { enPhoneNumber } from "./plugins/phone-number/en";
import { enSso } from "./plugins/sso/en";
import { enStripe } from "./plugins/stripe/en";
import { enTwoFactor } from "./plugins/two-factor/en";
import { enUsername } from "./plugins/username/en";

export const en: TranslationDictionary = {
	...enCore,
	...enUsername,
	...enSso,
	...enDeviceAuthorization,
	...enOauthPopup,
	...enOrganization,
	...enEmailOtp,
	...enApiKey,
	...enElectron,
	...enHaveIBeenPwned,
	...enStripe,
	...enMultiSession,
	...enAdmin,
	...enAnonymous,
	...enCaptcha,
	...enPasskey,
	...enTwoFactor,
	...enPhoneNumber,
	...enGenericOAuth,
};
