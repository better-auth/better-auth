import type { Import } from "./types";

export const supportedPlugins: SupportedPlugin[] = [
	{
		id: "two-factor",
		name: "twoFactor",
		imports: [
			{ path: "better-auth/plugins", variables: [{ name: "twoFactor" }] },
		],
		clientName: "twoFactorClient",
		clientImports: [
			{
				path: "better-auth/client/plugins",
				variables: [{ name: "twoFactorClient" }],
			},
		],
		defaultClientContent: ``,
		defaultContent: ``,
	},
	{
		id: "username",
		name: "username",
		clientName: "usernameClient",
		imports: [
			{ path: "better-auth/plugins", variables: [{ name: "username" }] },
		],
		clientImports: [
			{
				path: "better-auth/client/plugins",
				variables: [{ name: "usernameClient" }],
			},
		],
		defaultClientContent: ``,
		defaultContent: ``,
	},
	{
		id: "anonymous",
		name: "anonymous",
		clientName: "anonymousClient",
		imports: [
			{ path: "better-auth/plugins", variables: [{ name: "anonymous" }] },
		],
		clientImports: [
			{
				path: "better-auth/client/plugins",
				variables: [{ name: "anonymousClient" }],
			},
		],
		defaultClientContent: ``,
		defaultContent: ``,
	},
	{
		id: "phone-number",
		name: "phoneNumber",
		clientName: "phoneNumberClient",
		imports: [
			{ path: "better-auth/plugins", variables: [{ name: "phoneNumber" }] },
		],
		clientImports: [
			{
				path: "better-auth/client/plugins",
				variables: [{ name: "phoneNumberClient" }],
			},
		],
		defaultClientContent: ``,
		defaultContent: ``,
	},
	{
		id: "magic-link",
		name: "magicLink",
		imports: [
			{ path: "better-auth/plugins", variables: [{ name: "magicLink" }] },
		],
		clientName: "magicLinkClient",
		clientImports: [
			{
				path: "better-auth/client/plugins",
				variables: [{ name: "magicLinkClient" }],
			},
		],
		defaultClientContent: ``,
		defaultContent: `{\nsendMagicLink({ email, token, url }, request) {\n// Send email with magic link\n},\n}`,
	},
	{
		id: "email-otp",
		name: "emailOTP",
		clientName: "emailOTPClient",
		imports: [
			{ path: "better-auth/plugins", variables: [{ name: "emailOTP" }] },
		],
		clientImports: [
			{
				path: "better-auth/client/plugins",
				variables: [{ name: "emailOTPClient" }],
			},
		],
		defaultClientContent: ``,
		defaultContent: `{\nasync sendVerificationOTP({ email, otp, type }, request) {\n// Send email with OTP\n},\n}`,
	},
	{
		id: "passkey",
		name: "passkey",
		clientName: "passkeyClient",
		imports: [
			{ path: "better-auth/plugins/passkey", variables: [{ name: "passkey" }] },
		],
		clientImports: [
			{
				path: "better-auth/client/plugins",
				variables: [{ name: "passkeyClient" }],
			},
		],
		defaultClientContent: ``,
		defaultContent: ``,
	},
	{
		id: "generic-oauth",
		name: "genericOAuth",
		clientName: "genericOAuthClient",
		imports: [
			{ path: "better-auth/plugins", variables: [{ name: "genericOAuth" }] },
		],
		clientImports: [
			{
				path: "better-auth/client/plugins",
				variables: [{ name: "genericOAuthClient" }],
			},
		],
		defaultClientContent: ``,
		defaultContent: `{\nconfig: [],\n}`,
	},
	{
		id: "one-tap",
		name: "oneTap",
		clientName: "oneTapClient",
		imports: [{ path: "better-auth/plugins", variables: [{ name: "oneTap" }] }],
		clientImports: [
			{
				path: "better-auth/client/plugins",
				variables: [{ name: "oneTapClient" }],
			},
		],
		defaultClientContent: `{\nclientId: "MY_CLIENT_ID",\n}`,
		defaultContent: ``,
	},
	{
		id: "api-key",
		name: "apiKey",
		clientName: "apiKeyClient",
		imports: [{ path: "better-auth/plugins", variables: [{ name: "apiKey" }] }],
		clientImports: [
			{
				path: "better-auth/client/plugins",
				variables: [{ name: "apiKeyClient" }],
			},
		],
		defaultClientContent: ``,
		defaultContent: ``,
	},
	{
		id: "admin",
		name: "admin",
		clientName: "adminClient",
		imports: [{ path: "better-auth/plugins", variables: [{ name: "admin" }] }],
		clientImports: [
			{
				path: "better-auth/client/plugins",
				variables: [{ name: "adminClient" }],
			},
		],
		defaultClientContent: ``,
		defaultContent: ``,
	},
	{
		id: "organization",
		name: "organization",
		clientName: "organizationClient",
		imports: [
			{ path: "better-auth/plugins", variables: [{ name: "organization" }] },
		],
		clientImports: [
			{
				path: "better-auth/client/plugins",
				variables: [{ name: "organizationClient" }],
			},
		],
		defaultClientContent: ``,
		defaultContent: ``,
	},
	{
		id: "oidc",
		name: "oidcProvider",
		clientName: "oidcClient",
		imports: [
			{ path: "better-auth/plugins", variables: [{ name: "oidcProvider" }] },
		],
		clientImports: [
			{
				path: "better-auth/client/plugins",
				variables: [{ name: "oidcClient" }],
			},
		],
		defaultClientContent: ``,
		defaultContent: `{\nloginPage: "/sign-in",\n}`,
	},
	{
		id: "sso",
		name: "sso",
		clientName: "ssoClient",
		imports: [
			{ path: "better-auth/plugins/sso", variables: [{ name: "sso" }] },
		],
		clientImports: [
			{
				path: "better-auth/client/plugins",
				variables: [{ name: "ssoClient" }],
			},
		],
		defaultClientContent: ``,
		defaultContent: ``,
	},
	{
		id: "bearer",
		name: "bearer",
		imports: [{ path: "better-auth/plugins", variables: [{ name: "bearer" }] }],
		clientImports: [],
		clientName: undefined,
		defaultClientContent: ``,
		defaultContent: ``,
	},
	{
		id: "multi-session",
		name: "multiSession",
		clientName: "multiSessionClient",
		imports: [
			{ path: "better-auth/plugins", variables: [{ name: "multiSession" }] },
		],
		clientImports: [
			{
				path: "better-auth/client/plugins",
				variables: [{ name: "multiSessionClient" }],
			},
		],
		defaultClientContent: ``,
		defaultContent: ``,
	},
	{
		id: "oauth-proxy",
		name: "oAuthProxy",
		imports: [
			{ path: "better-auth/plugins", variables: [{ name: "oAuthProxy" }] },
		],
		clientImports: [],
		clientName: undefined,
		defaultClientContent: ``,
		defaultContent: ``,
	},
	{
		id: "open-api",
		name: "openAPI",
		imports: [
			{ path: "better-auth/plugins", variables: [{ name: "openAPI" }] },
		],
		clientImports: [],
		clientName: undefined,
		defaultClientContent: ``,
		defaultContent: ``,
	},
	{
		id: "jwt",
		name: "jwt",
		imports: [{ path: "better-auth/plugins", variables: [{ name: "jwt" }] }],
		clientImports: [],
		clientName: undefined,
		defaultClientContent: ``,
		defaultContent: ``,
	},
	{
		id: "next-cookies",
		name: "nextCookies",
		imports: [
			{ path: "better-auth/next-js", variables: [{ name: "nextCookies" }] },
		],
		clientImports: [],
		clientName: undefined,
		defaultClientContent: ``,
		defaultContent: ``,
	},
] as const;



export type SupportedPlugin = {
	id: string;
	name: string;
	imports: Import[];
	clientName: string | undefined;
	clientImports: Import[];
	defaultContent: string;
	defaultClientContent: string;
};

/**
 * Sort plugins for their placement in the array of the generated code.
 * 
 * Negative numbers are placed AFTER, positive numbers are placed BEFORE.
 */
export const sortPlugins = (
	x: SupportedPlugin,
	thisPlugin: SupportedPlugin,
): number => {
	if (thisPlugin.id === "next-cookies") return -1; // Always make next-cookies the last plugin.
	return 1;
};

export const supportedPluginIds = [
	"two-factor",
	"username",
	"anonymous",
	"phone-number",
	"magic-link",
	"email-otp",
	"passkey",
	"generic-oauth",
	"one-tap",
	"api-key",
	"admin",
	"organization",
	"oidc",
	"sso",
	"bearer",
	"multi-session",
	"oauth-proxy",
	"open-api",
	"jwt",
	"next-cookies",
] as const;
