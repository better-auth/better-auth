import type { TranslationDictionary } from "../types";
import { idCore } from "./core/id";
import { idAdmin } from "./plugins/admin/id";
import { idAnonymous } from "./plugins/anonymous/id";
import { idApiKey } from "./plugins/api-key/id";
import { idCaptcha } from "./plugins/captcha/id";
import { idDeviceAuthorization } from "./plugins/device-authorization/id";
import { idElectron } from "./plugins/electron/id";
import { idEmailOtp } from "./plugins/email-otp/id";
import { idGenericOAuth } from "./plugins/generic-oauth/id";
import { idHaveIBeenPwned } from "./plugins/haveibeenpwned/id";
import { idMultiSession } from "./plugins/multi-session/id";
import { idOauthPopup } from "./plugins/oauth-popup/id";
import { idOrganization } from "./plugins/organization/id";
import { idPasskey } from "./plugins/passkey/id";
import { idPhoneNumber } from "./plugins/phone-number/id";
import { idSso } from "./plugins/sso/id";
import { idStripe } from "./plugins/stripe/id";
import { idTwoFactor } from "./plugins/two-factor/id";
import { idUsername } from "./plugins/username/id";

export const id: TranslationDictionary = {
	...idCore,
	...idUsername,
	...idSso,
	...idDeviceAuthorization,
	...idOauthPopup,
	...idOrganization,
	...idEmailOtp,
	...idApiKey,
	...idElectron,
	...idHaveIBeenPwned,
	...idStripe,
	...idMultiSession,
	...idAdmin,
	...idAnonymous,
	...idCaptcha,
	...idPasskey,
	...idTwoFactor,
	...idPhoneNumber,
	...idGenericOAuth,
};
