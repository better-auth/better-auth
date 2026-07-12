import type { TranslationDictionary } from "../types";
import { thCore } from "./core/th";
import { thAdmin } from "./plugins/admin/th";
import { thAnonymous } from "./plugins/anonymous/th";
import { thApiKey } from "./plugins/api-key/th";
import { thCaptcha } from "./plugins/captcha/th";
import { thDeviceAuthorization } from "./plugins/device-authorization/th";
import { thElectron } from "./plugins/electron/th";
import { thEmailOtp } from "./plugins/email-otp/th";
import { thGenericOAuth } from "./plugins/generic-oauth/th";
import { thHaveIBeenPwned } from "./plugins/haveibeenpwned/th";
import { thMultiSession } from "./plugins/multi-session/th";
import { thOauthPopup } from "./plugins/oauth-popup/th";
import { thOrganization } from "./plugins/organization/th";
import { thPasskey } from "./plugins/passkey/th";
import { thPhoneNumber } from "./plugins/phone-number/th";
import { thSso } from "./plugins/sso/th";
import { thStripe } from "./plugins/stripe/th";
import { thTwoFactor } from "./plugins/two-factor/th";
import { thUsername } from "./plugins/username/th";

export const th: TranslationDictionary = {
	...thCore,
	...thUsername,
	...thSso,
	...thDeviceAuthorization,
	...thOauthPopup,
	...thOrganization,
	...thEmailOtp,
	...thApiKey,
	...thElectron,
	...thHaveIBeenPwned,
	...thStripe,
	...thMultiSession,
	...thAdmin,
	...thAnonymous,
	...thCaptcha,
	...thPasskey,
	...thTwoFactor,
	...thPhoneNumber,
	...thGenericOAuth,
};
