import { getOfficialMarketplacePlugins } from "./official";
import type { MarketplacePlugin } from "./types";
import { marketplaceCategories } from "./types";

export type { MarketplacePlugin };
export { marketplaceCategories };

/**
 * Curated community plugin registry for the marketplace.
 * Submit a PR to add your plugin: https://github.com/better-auth/better-auth/edit/main/docs/lib/marketplace/registry.ts
 */
export const communityMarketplacePlugins: MarketplacePlugin[] = [
	{
		slug: "dymo-api-better-auth",
		name: "@dymo-api/better-auth",
		repo: "TPEOficial/dymo-api-better-auth",
		description:
			"Sign Up Protection and validation of disposable emails (the world's largest database with nearly 14 million entries).",
		category: "Security",
		tags: ["email", "validation", "disposable"],
		npmPackage: "@dymo-api/better-auth",
		author: {
			name: "TPEOficial",
			github: "TPEOficial",
			avatar: "https://github.com/TPEOficial.png",
		},
	},
	{
		slug: "better-auth-harmony",
		name: "better-auth-harmony",
		repo: "gekorm/better-auth-harmony",
		description:
			"Email & phone normalization and additional validation, blocking over 55,000 temporary email domains.",
		category: "Security",
		tags: ["email", "phone", "validation"],
		npmPackage: "better-auth-harmony",
		author: {
			name: "GeKorm",
			github: "GeKorm",
			avatar: "https://github.com/GeKorm.png",
		},
	},
	{
		slug: "validation-better-auth",
		name: "validation-better-auth",
		repo: "Daanish2003/validation-better-auth",
		description:
			"Validate API request using any validation library (e.g., Zod, Yup)",
		category: "Utility",
		tags: ["validation", "zod", "yup"],
		npmPackage: "validation-better-auth",
		author: {
			name: "Daanish2003",
			github: "Daanish2003",
			avatar: "https://github.com/Daanish2003.png",
		},
	},
	{
		slug: "better-auth-localization",
		name: "better-auth-localization",
		repo: "marcellosso/better-auth-localization",
		description:
			"Localize and customize better-auth messages with easy translation and message override support.",
		category: "Integrations",
		tags: ["i18n", "localization"],
		npmPackage: "better-auth-localization",
		author: {
			name: "marcellosso",
			github: "marcellosso",
			avatar: "https://github.com/marcellosso.png",
		},
	},
	{
		slug: "better-auth-attio-plugin",
		name: "better-auth-attio-plugin",
		repo: "tobimori/better-auth-attio-plugin",
		description: "Sync your products Better Auth users & workspaces with Attio",
		category: "Integrations",
		tags: ["attio", "crm", "sync"],
		npmPackage: "better-auth-attio-plugin",
		author: {
			name: "tobimori",
			github: "tobimori",
			avatar: "https://github.com/tobimori.png",
		},
	},
	{
		slug: "better-auth-cloudflare",
		name: "better-auth-cloudflare",
		repo: "zpg6/better-auth-cloudflare",
		description:
			"Seamlessly integrate with Cloudflare Workers, D1, Hyperdrive, KV, R2, and geolocation services. Includes CLI for project generation, automated resource provisioning on Cloudflare, and database migrations. Supports Next.js, Hono, and more!",
		category: "Integrations",
		tags: ["cloudflare", "workers", "d1"],
		npmPackage: "better-auth-cloudflare",
		author: {
			name: "zpg6",
			github: "zpg6",
			avatar: "https://github.com/zpg6.png",
		},
	},
	{
		slug: "expo-better-auth-passkey",
		name: "expo-better-auth-passkey",
		repo: "kevcube/expo-better-auth-passkey",
		description:
			"Better-auth client plugin for using passkeys on mobile platforms in expo apps. Supports iOS, macOS, Android (and web!) by wrapping the existing better-auth passkey client plugin.",
		category: "Auth",
		tags: ["expo", "passkey", "mobile"],
		npmPackage: "expo-better-auth-passkey",
		author: {
			name: "kevcube",
			github: "kevcube",
			avatar: "https://github.com/kevcube.png",
		},
	},
	{
		slug: "better-auth-credentials-plugin",
		name: "better-auth-credentials-plugin",
		repo: "erickweil/better-auth-credentials-plugin",
		description: "LDAP authentication plugin for Better Auth.",
		category: "Auth",
		tags: ["ldap", "credentials"],
		npmPackage: "better-auth-credentials-plugin",
		author: {
			name: "erickweil",
			github: "erickweil",
			avatar: "https://github.com/erickweil.png",
		},
	},
	{
		slug: "better-auth-opaque",
		name: "better-auth-opaque",
		repo: "TheUntraceable/better-auth-opaque",
		description:
			"Provides database-breach resistant authentication using the zero-knowledge OPAQUE protocol.",
		category: "Security",
		tags: ["opaque", "zero-knowledge"],
		npmPackage: "better-auth-opaque",
		author: {
			name: "TheUntraceable",
			github: "TheUntraceable",
			avatar: "https://github.com/theuntraceable.png",
		},
	},
	{
		slug: "better-auth-firebase-auth",
		name: "better-auth-firebase-auth",
		repo: "yultyyev/better-auth-firebase-auth",
		description:
			"Firebase Authentication plugin for Better Auth with built-in email service, Google Sign-In, and password reset functionality.",
		category: "Auth",
		tags: ["firebase", "google"],
		npmPackage: "better-auth-firebase-auth",
		author: {
			name: "yultyyev",
			github: "yultyyev",
			avatar: "https://github.com/yultyyev.png",
		},
	},
	{
		slug: "better-auth-university",
		name: "better-auth-university",
		repo: "LuyxLLC/better-auth-university",
		description:
			"University plugin for allowing only specific email domains to be passed through. Includes a University model with name and domain.",
		category: "Auth",
		tags: ["university", "email-domain"],
		npmPackage: "better-auth-university",
		author: {
			name: "Fyrlex",
			github: "Fyrlex",
			avatar: "https://github.com/Fyrlex.png",
		},
	},
	{
		slug: "better-auth-paystack",
		name: "@alexasomba/better-auth-paystack",
		repo: "alexasomba/better-auth-paystack",
		description:
			"Paystack plugin for Better Auth. Integrates Paystack transactions, webhooks, and subscription flows.",
		category: "Payments",
		tags: ["paystack", "subscriptions"],
		npmPackage: "@alexasomba/better-auth-paystack",
		author: {
			name: "alexasomba",
			github: "alexasomba",
			avatar: "https://github.com/alexasomba.png",
		},
	},
	{
		slug: "better-auth-lark",
		name: "better-auth-lark",
		repo: "uselark/better-auth-lark",
		description:
			"Lark billing plugin that automatically creates customers and subscribes them to free plans on signup.",
		category: "Payments",
		tags: ["lark", "billing"],
		npmPackage: "better-auth-lark",
		author: {
			name: "Vijit",
			github: "vijit-lark",
			avatar: "https://github.com/vijit-lark.png",
		},
	},
	{
		slug: "stargate-better-auth",
		name: "stargate-better-auth",
		repo: "neiii/stargate-better-auth",
		description:
			"Gate access to resources based on whether the user has starred a repository",
		category: "Security",
		tags: ["github", "stars", "access"],
		npmPackage: "stargate-better-auth",
		author: {
			name: "neiii",
			github: "neiii",
			avatar: "https://github.com/neiii.png",
		},
	},
	{
		slug: "sequenzy-better-auth",
		name: "@sequenzy/better-auth",
		repo: "Sequenzy/sequenzy-better-auth",
		description:
			"Automatically add users to Sequenzy mailing lists on signup for seamless email marketing integration.",
		category: "Integrations",
		tags: ["email", "marketing"],
		npmPackage: "@sequenzy/better-auth",
		author: {
			name: "Sequenzy",
			github: "sequenzy",
			avatar: "https://sequenzy.com/logo.png",
		},
	},
	{
		slug: "better-auth-nostr",
		name: "better-auth-nostr",
		repo: "leon-wbr/better-auth-nostr",
		description: "Nostr authentication plugin for Better Auth (NIP-98).",
		category: "Auth",
		tags: ["nostr", "web3"],
		npmPackage: "better-auth-nostr",
		author: {
			name: "leon-wbr",
			github: "leon-wbr",
			avatar: "https://github.com/leon-wbr.png",
		},
	},
	{
		slug: "better-auth-strapi",
		name: "@ramiras123/better-auth-strapi",
		repo: "Ramiras123/better-auth-strapi",
		description: "Plugin for authorization via strapi",
		category: "Integrations",
		tags: ["strapi", "cms"],
		npmPackage: "@ramiras123/better-auth-strapi",
		author: {
			name: "Ramiras123",
			github: "ramiras123",
			avatar: "https://github.com/ramiras123.png",
		},
	},
	{
		slug: "better-auth-razorpay",
		name: "better-auth-razorpay",
		repo: "iamjasonkendrick/better-auth-razorpay",
		description:
			"Razorpay payment plugin for Better Auth. Integrates Razorpay payments, webhooks, and subscription flows.",
		category: "Payments",
		tags: ["razorpay", "payments"],
		npmPackage: "better-auth-razorpay",
		author: {
			name: "iamjasonkendrick",
			github: "iamjasonkendrick",
			avatar: "https://github.com/iamjasonkendrick.png",
		},
	},
	{
		slug: "better-auth-payu",
		name: "better-auth-payu",
		repo: "iamjasonkendrick/better-auth-payu",
		description:
			"PayU payment plugin for Better Auth. Integrates PayU payments, webhooks, and subscription flows.",
		category: "Payments",
		tags: ["payu", "payments"],
		npmPackage: "better-auth-payu",
		author: {
			name: "iamjasonkendrick",
			github: "iamjasonkendrick",
			avatar: "https://github.com/iamjasonkendrick.png",
		},
	},
	{
		slug: "better-invite",
		name: "better-invite",
		repo: "better-invite/better-invite",
		description:
			"Easily create and manage user invitations, allowing you to invite users with customizable settings and track usage.",
		category: "Utility",
		tags: ["invites", "onboarding"],
		npmPackage: "better-invite",
		author: {
			name: "Sandy",
			github: "0-Sandy",
			avatar: "https://github.com/0-Sandy.png",
		},
	},
	{
		slug: "better-auth-usos",
		name: "better-auth-usos",
		repo: "qamarq/better-auth-usos",
		description:
			"USOS plugin for Better Auth - allows students to authenticate using their university credentials via the USOS API. Using oauth 1a.",
		category: "Auth",
		tags: ["usos", "university", "oauth"],
		npmPackage: "better-auth-usos",
		author: {
			name: "qamarq",
			github: "qamarq",
			avatar: "https://github.com/qamarq.png",
		},
	},
	{
		slug: "better-auth-devtools",
		name: "better-auth-devtools",
		repo: "C-W-D-Harshit/better-auth-devtools",
		description:
			"A devtools panel for Better Auth that lets you create managed test users from templates, switch between sessions instantly, inspect live session data, and edit fields like roles on the fly. All from a floating React UI that only runs in development.",
		category: "Devtools",
		tags: ["devtools", "debugging", "sessions"],
		npmPackage: "better-auth-devtools",
		author: {
			name: "C-W-D-Harshit",
			github: "C-W-D-Harshit",
			avatar: "https://github.com/C-W-D-Harshit.png",
		},
	},
	{
		slug: "better-auth-audit-logs",
		name: "better-auth-audit-logs",
		repo: "ejirocodes/better-auth-audit-logs",
		description:
			"Audit log plugin for Better Auth. Auto-captures auth events with severity inference, PII redaction, custom storage backends, and retention policies.",
		category: "Security",
		tags: ["audit", "logs", "compliance"],
		npmPackage: "better-auth-audit-logs",
		author: {
			name: "ejirocodes",
			github: "ejirocodes",
			avatar: "https://github.com/ejirocodes.png",
		},
	},
	{
		slug: "better-near-auth",
		name: "better-near-auth",
		repo: "elliotBraem/better-near-auth",
		description:
			"Sign in with NEAR plugin with built-in gasless relay for on-chain delegate actions.",
		category: "Auth",
		tags: ["near", "web3", "wallet"],
		npmPackage: "better-near-auth",
		author: {
			name: "efiz.near",
			github: "elliotBraem",
			avatar: "https://github.com/elliotBraem.png",
		},
	},
	{
		slug: "ton-better-auth",
		name: "ton-better-auth",
		repo: "mhbdev/ton-better-auth",
		description: "Sign in with Ton Connect",
		category: "Auth",
		tags: ["ton", "web3", "wallet"],
		npmPackage: "ton-better-auth",
		author: {
			name: "mhbdev",
			github: "mhbdev",
			avatar: "https://github.com/mhbdev.png",
		},
	},
	{
		slug: "dbsc-toolkit-better-auth",
		name: "@dbsc-toolkit/better-auth",
		repo: "SulimanAbdulrazzaq/dbsc-toolkit",
		description:
			"Device Bound Session Credentials (DBSC). Binds sessions to a device-resident key so a stolen cookie can't be replayed from another machine. Native binding via TPM or Secure Enclave on Chromium 145+, with a Web Crypto polyfill for Firefox, Safari, and older Chromium.",
		category: "Security",
		tags: ["dbsc", "sessions", "device-binding"],
		npmPackage: "@dbsc-toolkit/better-auth",
		author: {
			name: "SulimanAbdulrazzaq",
			github: "SulimanAbdulrazzaq",
			avatar: "https://github.com/SulimanAbdulrazzaq.png",
		},
	},
	{
		slug: "better-auth-referral",
		name: "@marinedotsh/better-auth-referral",
		repo: "marinedotsh/better-auth-referral",
		description: "A Better Auth plugin for adding user referrals to your app.",
		category: "Utility",
		tags: ["referral", "growth"],
		npmPackage: "@marinedotsh/better-auth-referral",
		author: {
			name: "Shivam Gupta",
			github: "shivamrun",
			avatar: "https://github.com/shivamrun.png",
		},
	},
	{
		slug: "better-auth-instagram",
		name: "better-auth-instagram",
		repo: "rajatsandeepsen/better-auth-instagram",
		description: "Instagram Provider for Better Auth",
		category: "Auth",
		tags: ["instagram", "oauth", "social"],
		npmPackage: "better-auth-instagram",
		author: {
			name: "Rajat Sandeep",
			github: "rajatsandeepsen",
			avatar: "https://github.com/rajatsandeepsen.png",
		},
	},
	{
		slug: "better-auth-zoho",
		name: "better-auth-zoho",
		repo: "rajatsandeepsen/better-auth-zoho",
		description: "Zoho Provider for Better Auth",
		category: "Auth",
		tags: ["zoho", "oauth", "social"],
		npmPackage: "better-auth-zoho",
		author: {
			name: "Rajat Sandeep",
			github: "rajatsandeepsen",
			avatar: "https://github.com/rajatsandeepsen.png",
		},
	},
	{
		slug: "better-auth-snapchat",
		name: "better-auth-snapchat",
		repo: "rajatsandeepsen/better-auth-snapchat",
		description: "Snapchat Provider for Better Auth",
		category: "Auth",
		tags: ["snapchat", "oauth", "social"],
		npmPackage: "better-auth-snapchat",
		author: {
			name: "Rajat Sandeep",
			github: "rajatsandeepsen",
			avatar: "https://github.com/rajatsandeepsen.png",
		},
	},
	{
		slug: "better-inbox",
		name: "better-inbox",
		repo: "better-inbox/better-inbox",
		description:
			"In-app notifications for Better Auth apps. One plugin, one migration, one component. Notifications live in your database, addressed to your users.",
		category: "Utility",
		tags: ["notifications", "inbox"],
		npmPackage: "better-inbox",
		author: {
			name: "stewartjarod",
			github: "stewartjarod",
			avatar: "https://github.com/stewartjarod.png",
		},
	},
];

export const MARKETPLACE_SUBMIT_URL =
	"https://github.com/better-auth/better-auth/edit/main/docs/lib/marketplace/registry.ts";

/** Official docs plugins + curated community listings. */
export function getMarketplacePlugins(): MarketplacePlugin[] {
	return [...getOfficialMarketplacePlugins(), ...communityMarketplacePlugins];
}

/** @deprecated Prefer `communityMarketplacePlugins` or `getMarketplacePlugins()` */
export const marketplacePlugins = communityMarketplacePlugins;

export function getMarketplacePlugin(
	slug: string,
): MarketplacePlugin | undefined {
	return getMarketplacePlugins().find((plugin) => plugin.slug === slug);
}

export function getMarketplacePluginSlugs(): string[] {
	return getMarketplacePlugins().map((plugin) => plugin.slug);
}
