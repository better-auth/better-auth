import type { TranslationDictionary } from "../types";
import { frCore } from "./core/fr";
import { frAdmin } from "./plugins/admin/fr";
import { frAnonymous } from "./plugins/anonymous/fr";
import { frApiKey } from "./plugins/api-key/fr";
import { frCaptcha } from "./plugins/captcha/fr";
import { frDeviceAuthorization } from "./plugins/device-authorization/fr";
import { frElectron } from "./plugins/electron/fr";
import { frEmailOtp } from "./plugins/email-otp/fr";
import { frGenericOAuth } from "./plugins/generic-oauth/fr";
import { frHaveIBeenPwned } from "./plugins/haveibeenpwned/fr";
import { frMultiSession } from "./plugins/multi-session/fr";
import { frOauthPopup } from "./plugins/oauth-popup/fr";
import { frOrganization } from "./plugins/organization/fr";
import { frPasskey } from "./plugins/passkey/fr";
import { frPhoneNumber } from "./plugins/phone-number/fr";
import { frSso } from "./plugins/sso/fr";
import { frStripe } from "./plugins/stripe/fr";
import { frTwoFactor } from "./plugins/two-factor/fr";
import { frUsername } from "./plugins/username/fr";

export const fr: TranslationDictionary = {
	...frCore,
	...frUsername,
	...frSso,
	...frDeviceAuthorization,
	...frOauthPopup,
	...frOrganization,
	...frEmailOtp,
	...frApiKey,
	...frElectron,
	...frHaveIBeenPwned,
	...frStripe,
	...frMultiSession,
	...frAdmin,
	...frAnonymous,
	...frCaptcha,
	...frPasskey,
	...frTwoFactor,
	...frPhoneNumber,
	...frGenericOAuth,
};
