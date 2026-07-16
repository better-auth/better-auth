import type { TranslationDictionary } from "../types";
import { koCore } from "./core/ko";
import { koAdmin } from "./plugins/admin/ko";
import { koAnonymous } from "./plugins/anonymous/ko";
import { koApiKey } from "./plugins/api-key/ko";
import { koCaptcha } from "./plugins/captcha/ko";
import { koDeviceAuthorization } from "./plugins/device-authorization/ko";
import { koElectron } from "./plugins/electron/ko";
import { koEmailOtp } from "./plugins/email-otp/ko";
import { koGenericOAuth } from "./plugins/generic-oauth/ko";
import { koHaveIBeenPwned } from "./plugins/haveibeenpwned/ko";
import { koMultiSession } from "./plugins/multi-session/ko";
import { koOauthPopup } from "./plugins/oauth-popup/ko";
import { koOrganization } from "./plugins/organization/ko";
import { koPasskey } from "./plugins/passkey/ko";
import { koPhoneNumber } from "./plugins/phone-number/ko";
import { koSso } from "./plugins/sso/ko";
import { koStripe } from "./plugins/stripe/ko";
import { koTwoFactor } from "./plugins/two-factor/ko";
import { koUsername } from "./plugins/username/ko";

export const ko: TranslationDictionary = {
	...koCore,
	...koUsername,
	...koSso,
	...koDeviceAuthorization,
	...koOauthPopup,
	...koOrganization,
	...koEmailOtp,
	...koApiKey,
	...koElectron,
	...koHaveIBeenPwned,
	...koStripe,
	...koMultiSession,
	...koAdmin,
	...koAnonymous,
	...koCaptcha,
	...koPasskey,
	...koTwoFactor,
	...koPhoneNumber,
	...koGenericOAuth,
};
