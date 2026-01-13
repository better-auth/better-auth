import type { EnvVar, Feature, PluginConfig } from "../types.js";

export function generateSocialProviderConfig(provider: string): string {
	const upperName = provider.toUpperCase();
	return `${provider}: {
      clientId: process.env.${upperName}_CLIENT_ID!,
      clientSecret: process.env.${upperName}_CLIENT_SECRET!,
    }`;
}

export function getSocialProviderEnvVars(provider: string): EnvVar[] {
	const upperName = provider.toUpperCase();
	const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);

	return [
		{
			name: `${upperName}_CLIENT_ID`,
			description: `${providerName} OAuth client ID`,
			required: true,
			howToGet: `Create OAuth app at ${providerName} developer console`,
		},
		{
			name: `${upperName}_CLIENT_SECRET`,
			description: `${providerName} OAuth client secret`,
			required: true,
			howToGet: `Create OAuth app at ${providerName} developer console`,
		},
	];
}

const KNOWN_SOCIAL_PROVIDERS = [
	"google",
	"github",
	"apple",
	"discord",
	"twitter",
	"facebook",
	"microsoft",
	"linkedin",
	"spotify",
	"twitch",
	"slack",
	"gitlab",
	"reddit",
	"dropbox",
	"tiktok",
] as const;

const PLUGIN_CONFIGS: Record<string, PluginConfig> = {
	"2fa": {
		serverImport: 'import { twoFactor } from "better-auth/plugins";',
		clientImport:
			'import { twoFactorClient } from "better-auth/client/plugins";',
		serverPlugin: () => `twoFactor()`,
		clientPlugin: () => `twoFactorClient()`,
	},
	organization: {
		serverImport: 'import { organization } from "better-auth/plugins";',
		clientImport:
			'import { organizationClient } from "better-auth/client/plugins";',
		serverPlugin: () => `organization()`,
		clientPlugin: () => `organizationClient()`,
	},
	admin: {
		serverImport: 'import { admin } from "better-auth/plugins";',
		clientImport: 'import { adminClient } from "better-auth/client/plugins";',
		serverPlugin: () => `admin()`,
		clientPlugin: () => `adminClient()`,
	},
	username: {
		serverImport: 'import { username } from "better-auth/plugins";',
		clientImport:
			'import { usernameClient } from "better-auth/client/plugins";',
		serverPlugin: () => `username()`,
		clientPlugin: () => `usernameClient()`,
	},
	"multi-session": {
		serverImport: 'import { multiSession } from "better-auth/plugins";',
		clientImport:
			'import { multiSessionClient } from "better-auth/client/plugins";',
		serverPlugin: () => `multiSession()`,
		clientPlugin: () => `multiSessionClient()`,
	},
	"api-key": {
		serverImport: 'import { apiKey } from "better-auth/plugins";',
		clientImport: 'import { apiKeyClient } from "better-auth/client/plugins";',
		serverPlugin: () => `apiKey()`,
		clientPlugin: () => `apiKeyClient()`,
	},
	bearer: {
		serverImport: 'import { bearer } from "better-auth/plugins";',
		serverPlugin: () => `bearer()`,
	},
	jwt: {
		serverImport: 'import { jwt } from "better-auth/plugins";',
		serverPlugin: () => `jwt()`,
	},
	"magic-link": {
		serverImport: 'import { magicLink } from "better-auth/plugins";',
		clientImport:
			'import { magicLinkClient } from "better-auth/client/plugins";',
		serverPlugin: () => `magicLink({
      sendMagicLink: async ({ email, url }) => {
        // TODO: Send magic link email
        console.log("Send magic link to", email, url);
      },
    })`,
		clientPlugin: () => `magicLinkClient()`,
	},
	"phone-number": {
		serverImport: 'import { phoneNumber } from "better-auth/plugins";',
		clientImport:
			'import { phoneNumberClient } from "better-auth/client/plugins";',
		serverPlugin: () => `phoneNumber({
      sendOTP: async ({ phoneNumber, code }) => {
        // TODO: Send OTP via SMS
        console.log("Send OTP", code, "to", phoneNumber);
      },
    })`,
		clientPlugin: () => `phoneNumberClient()`,
	},
	passkey: {
		serverImport: 'import { passkey } from "better-auth/plugins";',
		clientImport: 'import { passkeyClient } from "better-auth/client/plugins";',
		serverPlugin: () => `passkey()`,
		clientPlugin: () => `passkeyClient()`,
	},
	anonymous: {
		serverImport: 'import { anonymous } from "better-auth/plugins";',
		clientImport:
			'import { anonymousClient } from "better-auth/client/plugins";',
		serverPlugin: () => `anonymous()`,
		clientPlugin: () => `anonymousClient()`,
	},
	captcha: {
		serverImport: 'import { captcha } from "better-auth/plugins";',
		serverPlugin: () => `captcha({
      provider: "cloudflare-turnstile", // or "recaptcha" or "hcaptcha"
      secretKey: process.env.CAPTCHA_SECRET_KEY!,
    })`,
		envVars: [
			{
				name: "CAPTCHA_SECRET_KEY",
				description: "Captcha provider secret key",
				required: true,
			},
		],
	},
};

export function generatePluginImports(plugins: string[]): {
	serverImports: string[];
	clientImports: string[];
} {
	const serverImports: string[] = [];
	const clientImports: string[] = [];

	for (const plugin of plugins) {
		const config = PLUGIN_CONFIGS[plugin];
		if (config) {
			serverImports.push(config.serverImport);
			if (config.clientImport) {
				clientImports.push(config.clientImport);
			}
		}
	}

	return { serverImports, clientImports };
}

export function generatePluginSetup(plugins: string[]): {
	serverPlugins: string[];
	clientPlugins: string[];
} {
	const serverPlugins: string[] = [];
	const clientPlugins: string[] = [];

	for (const plugin of plugins) {
		const config = PLUGIN_CONFIGS[plugin];
		if (config) {
			serverPlugins.push(config.serverPlugin());
			if (config.clientPlugin) {
				clientPlugins.push(config.clientPlugin());
			}
		}
	}

	return { serverPlugins, clientPlugins };
}

export function getPluginEnvVars(plugins: string[]): EnvVar[] {
	const envVars: EnvVar[] = [];

	for (const plugin of plugins) {
		const config = PLUGIN_CONFIGS[plugin];
		if (config?.envVars) {
			envVars.push(...config.envVars);
		}
	}

	return envVars;
}

export function categorizeFeatures(features: Feature[]): {
	socialProviders: string[];
	plugins: string[];
	hasEmailPassword: boolean;
} {
	const socialProviders: string[] = [];
	const plugins: string[] = [];
	let hasEmailPassword = false;

	for (const feature of features) {
		if (feature === "email-password") {
			hasEmailPassword = true;
		} else if (feature in PLUGIN_CONFIGS) {
			plugins.push(feature);
		} else {
			socialProviders.push(feature);
		}
	}

	return { socialProviders, plugins, hasEmailPassword };
}
