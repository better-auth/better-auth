import type { GetArgumentsOptions } from "../generate-auth";
import { type ImportGroup } from "../utility/imports";
import { adminPluginConfig } from "./plugin-admin.config";
import { anonymousPluginConfig } from "./plugin-anonymous.config";
import { apiKeyPluginConfig } from "./plugin-api-key.config";
import { bearerPluginConfig } from "./plugin-bearer.config";
import { captchaPluginConfig } from "./plugin-captcha.config";
import { deviceAuthorizationPluginConfig } from "./plugin-device-authorization.config";
import { emailOTPPluginConfig } from "./plugin-email-otp.config";
import { genericOAuthPluginConfig } from "./plugin-generic-oauth.config";
import { haveIBeenPwnedPluginConfig } from "./plugin-have-ibeen-pwned.config";
import { jwtPluginConfig } from "./plugin-jwt.config";
import { lastLoginMethodPluginConfig } from "./plugin-last-login-method.config";
import { magicLinkPluginConfig } from "./plugin-magic-link.config";
import { mcpPluginConfig } from "./plugin-mcp.config";
import { multiSessionPluginConfig } from "./plugin-multi-session.config";
import { oauthProxyPluginConfig } from "./plugin-oauth-proxy.config";
import { oidcProviderPluginConfig } from "./plugin-oidc-provider.config";
import { oneTapPluginConfig } from "./plugin-one-tap.config";
import { oneTimeTokenPluginConfig } from "./plugin-one-time-token.config";
import { openAPIPluginConfig } from "./plugin-open-api.config";
import { organizationPluginConfig } from "./plugin-organization.config";
import { passkeyPluginConfig } from "./plugin-passkey.config";
import { phoneNumberPluginConfig } from "./plugin-phone-number.config";
import { siwePluginConfig } from "./plugin-siwe.config";
import { ssoPluginConfig } from "./plugin-sso.config";
import { twoFactorPluginConfig } from "./plugin-two-factor.config";
import { usernamePluginConfig } from "./plugin-username.config";

export type Plugin = keyof typeof pluginsConfig;

export type PluginConfig = {
	displayName: string;
	auth: {
		function: string;
		imports: ImportGroup[];
		arguments?: GetArgumentsOptions[];
	};
	authClient: {
		function: string;
		imports: ImportGroup[];
		arguments?: GetArgumentsOptions[];
	} | null;
};

export type PluginsConfig = {
	[key in Plugin]: PluginConfig;
};

export const pluginsConfig = {
	twoFactor: twoFactorPluginConfig,
	username: usernamePluginConfig,
	anonymous: anonymousPluginConfig,
	phoneNumber: phoneNumberPluginConfig,
	magicLink: magicLinkPluginConfig,
	emailOTP: emailOTPPluginConfig,
	passkey: passkeyPluginConfig,
	genericOAuth: genericOAuthPluginConfig,
	oneTap: oneTapPluginConfig,
	siwe: siwePluginConfig,
	admin: adminPluginConfig,
	apiKey: apiKeyPluginConfig,
	mcp: mcpPluginConfig,
	organization: organizationPluginConfig,
	oidcProvider: oidcProviderPluginConfig,
	sso: ssoPluginConfig,
	bearer: bearerPluginConfig,
	deviceAuthorization: deviceAuthorizationPluginConfig,
	captcha: captchaPluginConfig,
	haveIBeenPwned: haveIBeenPwnedPluginConfig,
	lastLoginMethod: lastLoginMethodPluginConfig,
	multiSession: multiSessionPluginConfig,
	oauthProxy: oauthProxyPluginConfig,
	oneTimeToken: oneTimeTokenPluginConfig,
	openAPI: openAPIPluginConfig,
	jwt: jwtPluginConfig,
} as const satisfies Record<string, PluginConfig>;
