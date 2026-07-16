import type { TranslationDictionary } from "../types";
import { plCore } from "./core/pl";
import { plAdmin } from "./plugins/admin/pl";
import { plAnonymous } from "./plugins/anonymous/pl";
import { plApiKey } from "./plugins/api-key/pl";
import { plCaptcha } from "./plugins/captcha/pl";
import { plDeviceAuthorization } from "./plugins/device-authorization/pl";
import { plElectron } from "./plugins/electron/pl";
import { plEmailOtp } from "./plugins/email-otp/pl";
import { plGenericOAuth } from "./plugins/generic-oauth/pl";
import { plHaveIBeenPwned } from "./plugins/haveibeenpwned/pl";
import { plMultiSession } from "./plugins/multi-session/pl";
import { plOauthPopup } from "./plugins/oauth-popup/pl";
import { plOrganization } from "./plugins/organization/pl";
import { plPasskey } from "./plugins/passkey/pl";
import { plPhoneNumber } from "./plugins/phone-number/pl";
import { plSso } from "./plugins/sso/pl";
import { plStripe } from "./plugins/stripe/pl";
import { plTwoFactor } from "./plugins/two-factor/pl";
import { plUsername } from "./plugins/username/pl";

export const pl: TranslationDictionary = {
	...plCore,
	...plUsername,
	...plSso,
	...plDeviceAuthorization,
	...plOauthPopup,
	...plOrganization,
	...plEmailOtp,
	...plApiKey,
	...plElectron,
	...plHaveIBeenPwned,
	...plStripe,
	...plMultiSession,
	...plAdmin,
	...plAnonymous,
	...plCaptcha,
	...plPasskey,
	...plTwoFactor,
	...plPhoneNumber,
	...plGenericOAuth,
};
