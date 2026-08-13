import { apiKeyClient } from "@better-auth/api-key/client";
import { electronProxyClient } from "@better-auth/electron/proxy";
import { i18nClient } from "@better-auth/i18n/client";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { scimClient } from "@better-auth/scim/client";
import { ssoClient } from "@better-auth/sso/client";
import { stripeClient } from "@better-auth/stripe/client";
import { createAuthClient } from "better-auth/client";
import {
	adminClient,
	anonymousClient,
	deviceAuthorizationClient,
	emailOTPClient,
	genericOAuthClient,
	jwtClient,
	magicLinkClient,
	multiSessionClient,
	oauthPopupClient,
	oidcClient,
	oneTimeTokenClient,
	organizationClient,
	phoneNumberClient,
	siweClient,
	twoFactorClient,
	usernameClient,
} from "better-auth/client/plugins";

export const authClient = createAuthClient({
	plugins: [
		adminClient(),
		anonymousClient(),
		deviceAuthorizationClient(),
		emailOTPClient(),
		genericOAuthClient(),
		jwtClient(),
		magicLinkClient(),
		multiSessionClient(),
		oauthPopupClient(),
		oidcClient(),
		oneTimeTokenClient(),
		organizationClient(),
		phoneNumberClient(),
		siweClient(),
		twoFactorClient(),
		usernameClient(),
		apiKeyClient(),
		electronProxyClient({ protocol: "app://" }),
		i18nClient(),
		oauthProviderClient(),
		passkeyClient(),
		scimClient(),
		ssoClient(),
		stripeClient({ subscription: true }),
	],
});
