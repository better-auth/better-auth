import { source } from "@/lib/source";
import { officialPluginExamples } from "./examples";
import type {
	MarketplaceCategory,
	MarketplacePlugin,
	MarketplacePluginSetup,
} from "./types";

const BETTER_AUTH_AUTHOR = {
	name: "Better Auth",
	github: "better-auth",
	avatar: "https://github.com/better-auth.png",
} as const;

const CORE_PLUGINS = "better-auth/plugins";
const CORE_CLIENT = "better-auth/client/plugins";

type OfficialMeta = {
	category: MarketplaceCategory;
	/** Short marketplace blurb (preferred over docs frontmatter). */
	description: string;
	tags?: string[];
	/** Separate npm package when not bundled in `better-auth` */
	npmPackage?: string;
	/**
	 * Defaults to `true`. Partner payment plugins set `false` + `featured`
	 * so they list as Featured instead of Official (Stripe stays Official).
	 */
	official?: boolean;
	featured?: boolean;
	setup: MarketplacePluginSetup;
};

/**
 * Install / import metadata for official docs plugins.
 * Built-in plugins omit `npmPackage` (shipped with `better-auth`).
 */
const officialMeta: Record<string, OfficialMeta> = {
	"2fa": {
		category: "Auth",
		description:
			"Add TOTP, OTP, backup codes, and trusted devices for stronger sign-in.",
		tags: ["2fa", "totp", "otp"],
		setup: {
			exportName: "twoFactor",
			from: CORE_PLUGINS,
			clientExportName: "twoFactorClient",
			clientFrom: CORE_CLIENT,
		},
	},
	username: {
		category: "Auth",
		description:
			"Let users sign up and sign in with a username instead of email.",
		tags: ["username"],
		setup: { exportName: "username", from: CORE_PLUGINS },
	},
	anonymous: {
		category: "Auth",
		description:
			"Create temporary guest sessions so users can try your app before signing up.",
		tags: ["anonymous", "guest"],
		setup: { exportName: "anonymous", from: CORE_PLUGINS },
	},
	"phone-number": {
		category: "Auth",
		description:
			"Authenticate with phone numbers and SMS OTP. Great for mobile-first apps.",
		tags: ["phone", "sms"],
		setup: {
			exportName: "phoneNumber",
			from: CORE_PLUGINS,
			clientExportName: "phoneNumberClient",
			clientFrom: CORE_CLIENT,
		},
	},
	"magic-link": {
		category: "Auth",
		description:
			"Passwordless sign-in via one-click email links. No passwords to manage.",
		tags: ["magic-link", "passwordless"],
		setup: { exportName: "magicLink", from: CORE_PLUGINS },
	},
	"email-otp": {
		category: "Auth",
		description:
			"Verify users with short-lived one-time codes delivered by email.",
		tags: ["email", "otp"],
		setup: {
			exportName: "emailOTP",
			from: CORE_PLUGINS,
			clientExportName: "emailOTPClient",
			clientFrom: CORE_CLIENT,
		},
	},
	passkey: {
		category: "Auth",
		description:
			"Passwordless login with WebAuthn passkeys, biometrics, and hardware keys.",
		tags: ["passkey", "webauthn"],
		npmPackage: "@better-auth/passkey",
		setup: {
			exportName: "passkey",
			from: "@better-auth/passkey",
			clientExportName: "passkeyClient",
			clientFrom: "@better-auth/passkey/client",
		},
	},
	"generic-oauth": {
		category: "Auth",
		description:
			"Connect any OAuth 2.0 / OIDC provider with a small, flexible config.",
		tags: ["oauth"],
		setup: {
			exportName: "genericOAuth",
			from: CORE_PLUGINS,
			clientExportName: "genericOAuthClient",
			clientFrom: CORE_CLIENT,
		},
	},
	"one-tap": {
		category: "Auth",
		description:
			"Frictionless Google One Tap prompts so users can sign in without leaving the page.",
		tags: ["google", "one-tap"],
		setup: { exportName: "oneTap", from: CORE_PLUGINS },
	},
	siwe: {
		category: "Auth",
		description: "Sign in with Ethereum for wallet-based auth in Web3 apps.",
		tags: ["ethereum", "web3"],
		setup: { exportName: "siwe", from: CORE_PLUGINS },
	},
	admin: {
		category: "Auth",
		description:
			"Server APIs to ban users, impersonate sessions, and manage roles.",
		tags: ["admin"],
		setup: {
			exportName: "admin",
			from: CORE_PLUGINS,
			clientExportName: "adminClient",
			clientFrom: CORE_CLIENT,
		},
	},
	"api-key": {
		category: "Auth",
		description: "Issue, rotate, and verify API keys for programmatic access.",
		tags: ["api-key"],
		npmPackage: "@better-auth/api-key",
		setup: {
			exportName: "apiKey",
			from: "@better-auth/api-key",
			clientExportName: "apiKeyClient",
			clientFrom: "@better-auth/api-key/client",
		},
	},
	mcp: {
		category: "Integrations",
		description:
			"Expose your auth server as an OAuth provider for MCP / AI clients.",
		tags: ["mcp", "ai"],
		npmPackage: "@better-auth/mcp",
		setup: { exportName: "mcp", from: "@better-auth/mcp" },
	},
	organization: {
		category: "Auth",
		description:
			"Multi-tenant orgs with members, teams, roles, and invitations.",
		tags: ["organization", "teams"],
		setup: {
			exportName: "organization",
			from: CORE_PLUGINS,
			clientExportName: "organizationClient",
			clientFrom: CORE_CLIENT,
		},
	},
	"oauth-provider": {
		category: "Integrations",
		description:
			"Turn Better Auth into a full OAuth 2.1 provider for third-party apps.",
		tags: ["oauth", "oidc"],
		npmPackage: "@better-auth/oauth-provider",
		setup: {
			exportName: "oauthProvider",
			from: "@better-auth/oauth-provider",
		},
	},
	sso: {
		category: "Integrations",
		description:
			"Enterprise SSO with SAML and OIDC. Connect Okta, Azure AD, and more.",
		tags: ["sso", "saml", "oidc"],
		npmPackage: "@better-auth/sso",
		setup: {
			exportName: "sso",
			from: "@better-auth/sso",
			clientExportName: "ssoClient",
			clientFrom: "@better-auth/sso/client",
		},
	},
	scim: {
		category: "Integrations",
		description:
			"SCIM 2.0 provisioning so IdPs can sync users into your app automatically.",
		tags: ["scim", "provisioning"],
		npmPackage: "@better-auth/scim",
		setup: { exportName: "scim", from: "@better-auth/scim" },
	},
	bearer: {
		category: "Utility",
		description:
			"Authenticate API requests with Bearer tokens instead of cookies.",
		tags: ["bearer", "api"],
		setup: { exportName: "bearer", from: CORE_PLUGINS },
	},
	"device-authorization": {
		category: "Utility",
		description:
			"OAuth device flow for TVs, CLIs, and other limited-input devices.",
		tags: ["device", "oauth"],
		setup: { exportName: "deviceAuthorization", from: CORE_PLUGINS },
	},
	captcha: {
		category: "Security",
		description:
			"Block bots on sign-up and sensitive flows with CAPTCHA providers.",
		tags: ["captcha"],
		setup: { exportName: "captcha", from: CORE_PLUGINS },
	},
	"have-i-been-pwned": {
		category: "Security",
		description:
			"Reject passwords found in known breaches via Have I Been Pwned.",
		tags: ["password", "security"],
		setup: { exportName: "haveIBeenPwned", from: CORE_PLUGINS },
	},
	"last-login-method": {
		category: "Utility",
		description:
			"Remember how each user last signed in so you can highlight that method next time.",
		tags: ["login"],
		setup: { exportName: "lastLoginMethod", from: CORE_PLUGINS },
	},
	"multi-session": {
		category: "Utility",
		description:
			"Allow multiple active sessions per user and switch between accounts.",
		tags: ["session"],
		setup: {
			exportName: "multiSession",
			from: CORE_PLUGINS,
			clientExportName: "multiSessionClient",
			clientFrom: CORE_CLIENT,
		},
	},
	"oauth-proxy": {
		category: "Utility",
		description:
			"Proxy OAuth callbacks through your server. Helpful for preview and multi-env setups.",
		tags: ["oauth", "proxy"],
		setup: { exportName: "oAuthProxy", from: CORE_PLUGINS },
	},
	"one-time-token": {
		category: "Utility",
		description:
			"Generate and verify single-use tokens for secure one-shot actions.",
		tags: ["token"],
		setup: { exportName: "oneTimeToken", from: CORE_PLUGINS },
	},
	"open-api": {
		category: "Devtools",
		description:
			"Auto-generate an OpenAPI reference from your Better Auth endpoints.",
		tags: ["openapi"],
		setup: { exportName: "openAPI", from: CORE_PLUGINS },
	},
	jwt: {
		category: "Utility",
		description: "Issue JWTs for services that can't use cookie sessions.",
		tags: ["jwt"],
		setup: { exportName: "jwt", from: CORE_PLUGINS },
	},
	dub: {
		category: "Integrations",
		description:
			"Track leads and attribution with Dub links, plus OAuth account linking.",
		tags: ["dub", "analytics"],
		setup: { exportName: "dub", from: CORE_PLUGINS },
	},
	stripe: {
		category: "Payments",
		description:
			"Stripe subscriptions and customer billing wired into your auth user.",
		tags: ["stripe", "billing"],
		npmPackage: "@better-auth/stripe",
		setup: {
			exportName: "stripe",
			from: "@better-auth/stripe",
			clientExportName: "stripeClient",
			clientFrom: "@better-auth/stripe/client",
		},
	},
	polar: {
		category: "Payments",
		description:
			"Polar checkouts, portals, usage, and webhooks tied to your users.",
		tags: ["polar", "billing"],
		npmPackage: "@polar-sh/better-auth",
		official: false,
		featured: true,
		setup: {
			exportName: "polar",
			from: "@polar-sh/better-auth",
			clientExportName: "polarClient",
			clientFrom: "@polar-sh/better-auth/client",
		},
	},
	autumn: {
		category: "Payments",
		description:
			"Autumn billing and entitlements scoped to users or organizations.",
		tags: ["autumn", "billing"],
		npmPackage: "autumn-js",
		official: false,
		featured: true,
		setup: { exportName: "autumn", from: "autumn-js/better-auth" },
	},
	dodopayments: {
		category: "Payments",
		description:
			"Accept global payments with Dodo Payments from your auth layer.",
		tags: ["dodo", "billing"],
		npmPackage: "@dodopayments/better-auth",
		official: false,
		featured: true,
		setup: {
			exportName: "dodopayments",
			from: "@dodopayments/better-auth",
		},
	},
	creem: {
		category: "Payments",
		description:
			"Creem payments and subscriptions linked to Better Auth users.",
		tags: ["creem", "billing"],
		npmPackage: "@creem_io/better-auth",
		official: false,
		featured: true,
		setup: { exportName: "creem", from: "@creem_io/better-auth" },
	},
	chargebee: {
		category: "Payments",
		description: "Chargebee subscriptions and billing managed alongside auth.",
		tags: ["chargebee", "billing"],
		npmPackage: "@chargebee/better-auth",
		official: false,
		featured: true,
		setup: { exportName: "chargebee", from: "@chargebee/better-auth" },
	},
	commet: {
		category: "Payments",
		description: "Commet billing with subscriptions and usage-based pricing.",
		tags: ["commet", "billing"],
		npmPackage: "@commet/better-auth",
		official: false,
		featured: true,
		setup: { exportName: "commet", from: "@commet/better-auth" },
	},
	i18n: {
		category: "Utility",
		description: "Translate Better Auth error messages for localized apps.",
		tags: ["i18n", "localization"],
		npmPackage: "@better-auth/i18n",
		setup: { exportName: "i18n", from: "@better-auth/i18n" },
	},
	cimd: {
		category: "Integrations",
		description:
			"Unauthenticated dynamic client discovery for the OAuth provider.",
		tags: ["cimd", "oidc"],
		npmPackage: "@better-auth/cimd",
		setup: { exportName: "cimd", from: "@better-auth/cimd" },
	},
	"test-utils": {
		category: "Devtools",
		description: "Helpers for integration and E2E tests against Better Auth.",
		tags: ["testing"],
		npmPackage: "@better-auth/test-utils",
		setup: { exportName: "testUtils", from: "@better-auth/test-utils" },
	},
	"agent-auth": {
		category: "Integrations",
		description: "Identity, registration, and capability auth for AI agents.",
		tags: ["ai", "agents"],
		npmPackage: "@better-auth/agent-auth",
		setup: {
			exportName: "agentAuth",
			from: "@better-auth/agent-auth",
			clientExportName: "agentAuthClient",
			clientFrom: "@better-auth/agent-auth/client",
		},
	},
};

function fallbackSetup(slug: string): MarketplacePluginSetup {
	const exportName = slug.replace(/-([a-z])/g, (_, c: string) =>
		c.toUpperCase(),
	);
	return { exportName, from: CORE_PLUGINS };
}

function mapDocsCategory(category: string): MarketplaceCategory {
	switch (category) {
		case "Authentication":
		case "Authorization":
			return "Auth";
		case "Enterprise":
			return "Integrations";
		case "Payments":
			return "Payments";
		default:
			return "Utility";
	}
}

/** Official plugins derived from docs pages + marketplace install metadata. */
export function getOfficialMarketplacePlugins(): MarketplacePlugin[] {
	const pages = source.getPages();
	return pages
		.filter((page) => {
			const slug = page.slugs[1];
			return (
				page.slugs[0] === "plugins" &&
				page.slugs.length === 2 &&
				slug != null &&
				slug !== "community-plugins" &&
				slug !== "index"
			);
		})
		.map((page) => {
			const slug = page.slugs[1]!;
			const meta = officialMeta[slug];
			const setup = meta?.setup ?? fallbackSetup(slug);
			return {
				slug,
				name: page.data.title,
				repo: "better-auth/better-auth",
				description:
					meta?.description ?? page.data.description ?? page.data.title,
				category: meta?.category ?? mapDocsCategory("Utility"),
				tags: meta?.tags ?? ["official"],
				npmPackage: meta?.npmPackage,
				author: BETTER_AUTH_AUTHOR,
				official: meta?.official !== false,
				featured: meta?.featured,
				docsHref: `/docs/plugins/${slug}`,
				setup,
				examples: officialPluginExamples[slug],
			} satisfies MarketplacePlugin;
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}
