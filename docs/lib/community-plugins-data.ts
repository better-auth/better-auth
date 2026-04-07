export interface CommunityPlugin {
	name: string;
	url: string;
	description: string;
	author: {
		name: string;
		github: string;
		avatar: string;
	};
}

export const communityPlugins: CommunityPlugin[] = [
	{
		name: "@dymo-api/better-auth",
		url: "https://github.com/TPEOficial/dymo-api-better-auth",
		description:
			"Sign Up Protection and validation of disposable emails (the world's largest database with nearly 14 million entries).",
		author: {
			name: "TPEOficial",
			github: "TPEOficial",
			avatar: "https://github.com/TPEOficial.png",
		},
	},
	{
		name: "better-auth-harmony",
		url: "https://github.com/gekorm/better-auth-harmony/",
		description:
			"Email & phone normalization and additional validation, blocking over 55,000 temporary email domains.",
		author: {
			name: "GeKorm",
			github: "GeKorm",
			avatar: "https://github.com/GeKorm.png",
		},
	},
	{
		name: "validation-better-auth",
		url: "https://github.com/Daanish2003/validation-better-auth",
		description:
			"Validate API request using any validation library (e.g., Zod, Yup)",
		author: {
			name: "Daanish2003",
			github: "Daanish2003",
			avatar: "https://github.com/Daanish2003.png",
		},
	},
	{
		name: "better-auth-localization",
		url: "https://github.com/marcellosso/better-auth-localization",
		description:
			"Localize and customize better-auth messages with easy translation and message override support.",
		author: {
			name: "marcellosso",
			github: "marcellosso",
			avatar: "https://github.com/marcellosso.png",
		},
	},
	{
		name: "better-auth-attio-plugin",
		url: "https://github.com/tobimori/better-auth-attio-plugin",
		description: "Sync your products Better Auth users & workspaces with Attio",
		author: {
			name: "tobimori",
			github: "tobimori",
			avatar: "https://github.com/tobimori.png",
		},
	},
	{
		name: "better-auth-cloudflare",
		url: "https://github.com/zpg6/better-auth-cloudflare",
		description:
			"Seamlessly integrate with Cloudflare Workers, D1, Hyperdrive, KV, R2, and geolocation services. Includes CLI for project generation, automated resource provisioning on Cloudflare, and database migrations. Supports Next.js, Hono, and more!",
		author: {
			name: "zpg6",
			github: "zpg6",
			avatar: "https://github.com/zpg6.png",
		},
	},
	{
		name: "expo-better-auth-passkey",
		url: "https://github.com/kevcube/expo-better-auth-passkey",
		description:
			"Better-auth client plugin for using passkeys on mobile platforms in expo apps. Supports iOS, macOS, Android (and web!) by wrapping the existing better-auth passkey client plugin.",
		author: {
			name: "kevcube",
			github: "kevcube",
			avatar: "https://github.com/kevcube.png",
		},
	},
	{
		name: "better-auth-credentials-plugin",
		url: "https://github.com/erickweil/better-auth-credentials-plugin",
		description: "LDAP authentication plugin for Better Auth.",
		author: {
			name: "erickweil",
			github: "erickweil",
			avatar: "https://github.com/erickweil.png",
		},
	},
	{
		name: "better-auth-opaque",
		url: "https://github.com/TheUntraceable/better-auth-opaque",
		description:
			"Provides database-breach resistant authentication using the zero-knowledge OPAQUE protocol.",
		author: {
			name: "TheUntraceable",
			github: "TheUntraceable",
			avatar: "https://github.com/theuntraceable.png",
		},
	},
	{
		name: "better-auth-firebase-auth",
		url: "https://github.com/yultyyev/better-auth-firebase-auth",
		description:
			"Firebase Authentication plugin for Better Auth with built-in email service, Google Sign-In, and password reset functionality.",
		author: {
			name: "yultyyev",
			github: "yultyyev",
			avatar: "https://github.com/yultyyev.png",
		},
	},
	{
		name: "better-auth-university",
		url: "https://github.com/LuyxLLC/better-auth-university",
		description:
			"University plugin for allowing only specific email domains to be passed through. Includes a University model with name and domain.",
		author: {
			name: "Fyrlex",
			github: "Fyrlex",
			avatar: "https://github.com/Fyrlex.png",
		},
	},
	{
		name: "@alexasomba/better-auth-paystack",
		url: "https://github.com/alexasomba/better-auth-paystack",
		description:
			"Paystack plugin for Better Auth — integrates Paystack transactions, webhooks, and subscription flows.",
		author: {
			name: "alexasomba",
			github: "alexasomba",
			avatar: "https://github.com/alexasomba.png",
		},
	},
	{
		name: "better-auth-lark",
		url: "https://github.com/uselark/better-auth-lark",
		description:
			"Lark billing plugin that automatically creates customers and subscribes them to free plans on signup.",
		author: {
			name: "Vijit",
			github: "vijit-lark",
			avatar: "https://github.com/vijit-lark.png",
		},
	},
	{
		name: "stargate-better-auth",
		url: "https://github.com/neiii/stargate-better-auth",
		description:
			"Gate access to resources based on whether the user has starred a repository",
		author: {
			name: "neiii",
			github: "neiii",
			avatar: "https://github.com/neiii.png",
		},
	},
	{
		name: "@sequenzy/better-auth",
		url: "https://github.com/Sequenzy/sequenzy-better-auth",
		description:
			"Automatically add users to Sequenzy mailing lists on signup for seamless email marketing integration.",
		author: {
			name: "Sequenzy",
			github: "sequenzy",
			avatar: "https://sequenzy.com/logo.png",
		},
	},
	{
		name: "better-auth-nostr",
		url: "https://github.com/leon-wbr/better-auth-nostr",
		description: "Nostr authentication plugin for Better Auth (NIP-98).",
		author: {
			name: "leon-wbr",
			github: "leon-wbr",
			avatar: "https://github.com/leon-wbr.png",
		},
	},
	{
		name: "@ramiras123/better-auth-strapi",
		url: "https://github.com/Ramiras123/better-auth-strapi",
		description: "Plugin for authorization via strapi",
		author: {
			name: "Ramiras123",
			github: "ramiras123",
			avatar: "https://github.com/ramiras123.png",
		},
	},
	{
		name: "better-auth-razorpay",
		url: "https://github.com/iamjasonkendrick/better-auth-razorpay",
		description:
			"Razorpay payment plugin for Better Auth — integrates Razorpay payments, webhooks, and subscription flows.",
		author: {
			name: "iamjasonkendrick",
			github: "iamjasonkendrick",
			avatar: "https://github.com/iamjasonkendrick.png",
		},
	},
	{
		name: "better-auth-payu",
		url: "https://github.com/iamjasonkendrick/better-auth-payu",
		description:
			"PayU payment plugin for Better Auth — integrates PayU payments, webhooks, and subscription flows.",
		author: {
			name: "iamjasonkendrick",
			github: "iamjasonkendrick",
			avatar: "https://github.com/iamjasonkendrick.png",
		},
	},
	{
		name: "better-auth-usos",
		url: "https://github.com/qamarq/better-auth-usos",
		description:
			"USOS plugin for Better Auth - allows students to authenticate using their university credentials via the USOS API. Using oauth 1a.",
		author: {
			name: "qamarq",
			github: "qamarq",
			avatar: "https://github.com/qamarq.png",
		},
	},
	{
		name: "better-auth-devtools",
		url: "https://github.com/C-W-D-Harshit/better-auth-devtools",
		description:
			"A devtools panel for Better Auth that lets you create managed test users from templates, switch between sessions instantly, inspect live session data, and edit fields like roles on the fly. All from a floating React UI that only runs in development.",
		author: {
			name: "C-W-D-Harshit",
			github: "C-W-D-Harshit",
			avatar: "https://github.com/C-W-D-Harshit.png",
		},
	},
	{
		name: "@pinklemon8/better-auth-siws",
		url: "https://github.com/ysrdevs/better-auth-siws",
		description:
			"Sign In With Solana (SIWS) — wallet authentication, linking, and ready-made React components.",
		author: {
			name: "ysrdevs",
			github: "ysrdevs",
			avatar: "https://github.com/ysrdevs.png",
		},
	},
];
