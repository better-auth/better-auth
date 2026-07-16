import type { TranslationDictionary } from "../types";
import { faCore } from "./core/fa";
import { faAdmin } from "./plugins/admin/fa";
import { faAnonymous } from "./plugins/anonymous/fa";
import { faApiKey } from "./plugins/api-key/fa";
import { faCaptcha } from "./plugins/captcha/fa";
import { faDeviceAuthorization } from "./plugins/device-authorization/fa";
import { faElectron } from "./plugins/electron/fa";
import { faEmailOtp } from "./plugins/email-otp/fa";
import { faGenericOAuth } from "./plugins/generic-oauth/fa";
import { faHaveIBeenPwned } from "./plugins/haveibeenpwned/fa";
import { faMultiSession } from "./plugins/multi-session/fa";
import { faOauthPopup } from "./plugins/oauth-popup/fa";
import { faOrganization } from "./plugins/organization/fa";
import { faPasskey } from "./plugins/passkey/fa";
import { faPhoneNumber } from "./plugins/phone-number/fa";
import { faSso } from "./plugins/sso/fa";
import { faStripe } from "./plugins/stripe/fa";
import { faTwoFactor } from "./plugins/two-factor/fa";
import { faUsername } from "./plugins/username/fa";

export const fa: TranslationDictionary = {
	...faCore,
	...faUsername,
	...faSso,
	...faDeviceAuthorization,
	...faOauthPopup,
	...faOrganization,
	...faEmailOtp,
	...faApiKey,
	...faElectron,
	...faHaveIBeenPwned,
	...faStripe,
	...faMultiSession,
	...faAdmin,
	...faAnonymous,
	...faCaptcha,
	...faPasskey,
	...faTwoFactor,
	...faPhoneNumber,
	...faGenericOAuth,
};
