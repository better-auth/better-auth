import type { TranslationDictionary } from "../types";
import { esCore } from "./core/es";
import { esAdmin } from "./plugins/admin/es";
import { esAnonymous } from "./plugins/anonymous/es";
import { esApiKey } from "./plugins/api-key/es";
import { esCaptcha } from "./plugins/captcha/es";
import { esDeviceAuthorization } from "./plugins/device-authorization/es";
import { esElectron } from "./plugins/electron/es";
import { esEmailOtp } from "./plugins/email-otp/es";
import { esGenericOAuth } from "./plugins/generic-oauth/es";
import { esHaveIBeenPwned } from "./plugins/haveibeenpwned/es";
import { esMultiSession } from "./plugins/multi-session/es";
import { esOauthPopup } from "./plugins/oauth-popup/es";
import { esOrganization } from "./plugins/organization/es";
import { esPasskey } from "./plugins/passkey/es";
import { esPhoneNumber } from "./plugins/phone-number/es";
import { esSso } from "./plugins/sso/es";
import { esStripe } from "./plugins/stripe/es";
import { esTwoFactor } from "./plugins/two-factor/es";
import { esUsername } from "./plugins/username/es";

export const es: TranslationDictionary = {
	...esCore,
	...esUsername,
	...esSso,
	...esDeviceAuthorization,
	...esOauthPopup,
	...esOrganization,
	...esEmailOtp,
	...esApiKey,
	...esElectron,
	...esHaveIBeenPwned,
	...esStripe,
	...esMultiSession,
	...esAdmin,
	...esAnonymous,
	...esCaptcha,
	...esPasskey,
	...esTwoFactor,
	...esPhoneNumber,
	...esGenericOAuth,
};
