import type { TranslationDictionary } from "../types";
import { itCore } from "./core/it";
import { itAdmin } from "./plugins/admin/it";
import { itAnonymous } from "./plugins/anonymous/it";
import { itApiKey } from "./plugins/api-key/it";
import { itCaptcha } from "./plugins/captcha/it";
import { itDeviceAuthorization } from "./plugins/device-authorization/it";
import { itElectron } from "./plugins/electron/it";
import { itEmailOtp } from "./plugins/email-otp/it";
import { itGenericOAuth } from "./plugins/generic-oauth/it";
import { itHaveIBeenPwned } from "./plugins/haveibeenpwned/it";
import { itMultiSession } from "./plugins/multi-session/it";
import { itOauthPopup } from "./plugins/oauth-popup/it";
import { itOrganization } from "./plugins/organization/it";
import { itPasskey } from "./plugins/passkey/it";
import { itPhoneNumber } from "./plugins/phone-number/it";
import { itSso } from "./plugins/sso/it";
import { itStripe } from "./plugins/stripe/it";
import { itTwoFactor } from "./plugins/two-factor/it";
import { itUsername } from "./plugins/username/it";

export const it: TranslationDictionary = {
	...itCore,
	...itUsername,
	...itSso,
	...itDeviceAuthorization,
	...itOauthPopup,
	...itOrganization,
	...itEmailOtp,
	...itApiKey,
	...itElectron,
	...itHaveIBeenPwned,
	...itStripe,
	...itMultiSession,
	...itAdmin,
	...itAnonymous,
	...itCaptcha,
	...itPasskey,
	...itTwoFactor,
	...itPhoneNumber,
	...itGenericOAuth,
};
