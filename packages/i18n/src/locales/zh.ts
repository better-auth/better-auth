import type { TranslationDictionary } from "../types";
import { zhCore } from "./core/zh";
import { zhAdmin } from "./plugins/admin/zh";
import { zhAnonymous } from "./plugins/anonymous/zh";
import { zhApiKey } from "./plugins/api-key/zh";
import { zhCaptcha } from "./plugins/captcha/zh";
import { zhDeviceAuthorization } from "./plugins/device-authorization/zh";
import { zhElectron } from "./plugins/electron/zh";
import { zhEmailOtp } from "./plugins/email-otp/zh";
import { zhGenericOAuth } from "./plugins/generic-oauth/zh";
import { zhHaveIBeenPwned } from "./plugins/haveibeenpwned/zh";
import { zhMultiSession } from "./plugins/multi-session/zh";
import { zhOauthPopup } from "./plugins/oauth-popup/zh";
import { zhOrganization } from "./plugins/organization/zh";
import { zhPasskey } from "./plugins/passkey/zh";
import { zhPhoneNumber } from "./plugins/phone-number/zh";
import { zhSso } from "./plugins/sso/zh";
import { zhStripe } from "./plugins/stripe/zh";
import { zhTwoFactor } from "./plugins/two-factor/zh";
import { zhUsername } from "./plugins/username/zh";

export const zh: TranslationDictionary = {
	...zhCore,
	...zhUsername,
	...zhSso,
	...zhDeviceAuthorization,
	...zhOauthPopup,
	...zhOrganization,
	...zhEmailOtp,
	...zhApiKey,
	...zhElectron,
	...zhHaveIBeenPwned,
	...zhStripe,
	...zhMultiSession,
	...zhAdmin,
	...zhAnonymous,
	...zhCaptcha,
	...zhPasskey,
	...zhTwoFactor,
	...zhPhoneNumber,
	...zhGenericOAuth,
};
