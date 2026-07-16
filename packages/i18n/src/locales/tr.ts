import type { TranslationDictionary } from "../types";
import { trCore } from "./core/tr";
import { trAdmin } from "./plugins/admin/tr";
import { trAnonymous } from "./plugins/anonymous/tr";
import { trApiKey } from "./plugins/api-key/tr";
import { trCaptcha } from "./plugins/captcha/tr";
import { trDeviceAuthorization } from "./plugins/device-authorization/tr";
import { trElectron } from "./plugins/electron/tr";
import { trEmailOtp } from "./plugins/email-otp/tr";
import { trGenericOAuth } from "./plugins/generic-oauth/tr";
import { trHaveIBeenPwned } from "./plugins/haveibeenpwned/tr";
import { trMultiSession } from "./plugins/multi-session/tr";
import { trOauthPopup } from "./plugins/oauth-popup/tr";
import { trOrganization } from "./plugins/organization/tr";
import { trPasskey } from "./plugins/passkey/tr";
import { trPhoneNumber } from "./plugins/phone-number/tr";
import { trSso } from "./plugins/sso/tr";
import { trStripe } from "./plugins/stripe/tr";
import { trTwoFactor } from "./plugins/two-factor/tr";
import { trUsername } from "./plugins/username/tr";

export const tr: TranslationDictionary = {
	...trCore,
	...trUsername,
	...trSso,
	...trDeviceAuthorization,
	...trOauthPopup,
	...trOrganization,
	...trEmailOtp,
	...trApiKey,
	...trElectron,
	...trHaveIBeenPwned,
	...trStripe,
	...trMultiSession,
	...trAdmin,
	...trAnonymous,
	...trCaptcha,
	...trPasskey,
	...trTwoFactor,
	...trPhoneNumber,
	...trGenericOAuth,
};
