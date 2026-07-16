import type { TranslationDictionary } from "../types";
import { bnCore } from "./core/bn";
import { bnAdmin } from "./plugins/admin/bn";
import { bnAnonymous } from "./plugins/anonymous/bn";
import { bnApiKey } from "./plugins/api-key/bn";
import { bnCaptcha } from "./plugins/captcha/bn";
import { bnDeviceAuthorization } from "./plugins/device-authorization/bn";
import { bnElectron } from "./plugins/electron/bn";
import { bnEmailOtp } from "./plugins/email-otp/bn";
import { bnGenericOAuth } from "./plugins/generic-oauth/bn";
import { bnHaveIBeenPwned } from "./plugins/haveibeenpwned/bn";
import { bnMultiSession } from "./plugins/multi-session/bn";
import { bnOauthPopup } from "./plugins/oauth-popup/bn";
import { bnOrganization } from "./plugins/organization/bn";
import { bnPasskey } from "./plugins/passkey/bn";
import { bnPhoneNumber } from "./plugins/phone-number/bn";
import { bnSso } from "./plugins/sso/bn";
import { bnStripe } from "./plugins/stripe/bn";
import { bnTwoFactor } from "./plugins/two-factor/bn";
import { bnUsername } from "./plugins/username/bn";

export const bn: TranslationDictionary = {
	...bnCore,
	...bnUsername,
	...bnSso,
	...bnDeviceAuthorization,
	...bnOauthPopup,
	...bnOrganization,
	...bnEmailOtp,
	...bnApiKey,
	...bnElectron,
	...bnHaveIBeenPwned,
	...bnStripe,
	...bnMultiSession,
	...bnAdmin,
	...bnAnonymous,
	...bnCaptcha,
	...bnPasskey,
	...bnTwoFactor,
	...bnPhoneNumber,
	...bnGenericOAuth,
};
