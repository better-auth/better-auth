import { communityPlugins } from "@/lib/community-plugins-data";
import { source } from "@/lib/source";

export interface Plugin {
	name: string;
	slug: string;
	description: string;
	tagline: string;
	category: string;
	type: "official" | "community";
	href: string;
	author?: string;
	icon: string;
}

const pluginMeta: Record<
	string,
	{ category: string; icon: string; tagline: string }
> = {
	// Authentication
	"2fa": {
		category: "Authentication",
		icon: "ScanFace",
		tagline: "Two-factor authentication with TOTP and backup codes",
	},
	username: {
		category: "Authentication",
		icon: "UserSquare2",
		tagline: "Classic username and password authentication",
	},
	anonymous: {
		category: "Authentication",
		icon: "UserCircle",
		tagline: "Let users try your app without creating an account",
	},
	"phone-number": {
		category: "Authentication",
		icon: "Phone",
		tagline: "Authenticate users with their phone number via SMS",
	},
	"magic-link": {
		category: "Authentication",
		icon: "Mailbox",
		tagline: "Passwordless sign-in with email magic links",
	},
	"email-otp": {
		category: "Authentication",
		icon: "Mail",
		tagline: "One-time passcode verification delivered via email",
	},
	passkey: {
		category: "Authentication",
		icon: "Fingerprint",
		tagline: "Passwordless login with biometrics and hardware keys",
	},
	"generic-oauth": {
		category: "Authentication",
		icon: "Globe",
		tagline: "Connect any OAuth 2.0 provider with minimal config",
	},
	"one-tap": {
		category: "Authentication",
		icon: "MousePointerClick",
		tagline: "Google One Tap sign-in for frictionless login",
	},
	siwe: {
		category: "Authentication",
		icon: "Wallet",
		tagline: "Sign in with Ethereum wallet for Web3 apps",
	},
	// Authorization
	admin: {
		category: "Authorization",
		icon: "ShieldCheck",
		tagline: "Admin dashboard APIs to manage users and sessions",
	},
	"api-key": {
		category: "Authorization",
		icon: "KeyRound",
		tagline: "Issue and manage API keys for programmatic access",
	},
	mcp: {
		category: "Authorization",
		icon: "Cpu",
		tagline: "Model Context Protocol server for AI agent auth",
	},
	organization: {
		category: "Authorization",
		icon: "Users2",
		tagline: "Multi-tenant organizations with roles and invitations",
	},
	// Enterprise
	"oidc-provider": {
		category: "Enterprise",
		icon: "Globe",
		tagline: "OpenID Connect provider for federated identity",
	},
	"oauth-provider": {
		category: "Enterprise",
		icon: "Server",
		tagline: "Turn your app into a full OAuth 2.0 provider",
	},
	sso: {
		category: "Enterprise",
		icon: "Building2",
		tagline: "Enterprise SSO with SAML and OIDC providers",
	},
	scim: {
		category: "Enterprise",
		icon: "ArrowLeftRight",
		tagline: "Automated user provisioning with SCIM 2.0",
	},
	// Utility
	bearer: {
		category: "Utility",
		icon: "Key",
		tagline: "Bearer token authentication for API access",
	},
	"device-authorization": {
		category: "Utility",
		icon: "Monitor",
		tagline: "OAuth device flow for TVs and CLI tools",
	},
	captcha: {
		category: "Utility",
		icon: "ShieldAlert",
		tagline: "Protect forms from bots with CAPTCHA verification",
	},
	"have-i-been-pwned": {
		category: "Utility",
		icon: "ShieldAlert",
		tagline: "Check passwords against known data breaches",
	},
	"last-login-method": {
		category: "Utility",
		icon: "LogIn",
		tagline: "Track and display the user's last login method",
	},
	"multi-session": {
		category: "Utility",
		icon: "Users",
		tagline: "Support multiple active sessions per user",
	},
	"oauth-proxy": {
		category: "Utility",
		icon: "ArrowLeftRight",
		tagline: "Proxy OAuth requests through your own server",
	},
	"one-time-token": {
		category: "Utility",
		icon: "Timer",
		tagline: "Generate single-use tokens for secure actions",
	},
	"open-api": {
		category: "Utility",
		icon: "FileCode",
		tagline: "Auto-generate OpenAPI spec from your auth endpoints",
	},
	jwt: {
		category: "Utility",
		icon: "FileKey",
		tagline: "JWT session tokens for stateless authentication",
	},
	dub: {
		category: "Utility",
		icon: "Link2",
		tagline: "Dub referral and link tracking integration",
	},
	// Payments
	stripe: {
		category: "Payments",
		icon: "StripeIcon",
		tagline: "Stripe subscriptions and payments tied to auth",
	},
	polar: {
		category: "Payments",
		icon: "PolarIcon",
		tagline: "Polar payments and subscriptions integration",
	},
	autumn: {
		category: "Payments",
		icon: "AutumnIcon",
		tagline: "Autumn billing and subscription management",
	},
	dodopayments: {
		category: "Payments",
		icon: "DodoPaymentsIcon",
		tagline: "DodoPayments integration for global payments",
	},
	creem: {
		category: "Payments",
		icon: "CreemIcon",
		tagline: "Creem payment processing for your app",
	},
	commet: {
		category: "Payments",
		icon: "CommetIcon",
		tagline: "Real-time comments and threads for your app",
	},
	chargebee: {
		category: "Payments",
		icon: "ChargebeeIcon",
		tagline: "Chargebee subscription and billing management",
	},
};

export const categories = [
	"Authentication",
	"Authorization",
	"Enterprise",
	"Utility",
	"Payments",
	"Community",
] as const;

export function getOfficialPlugins(): Plugin[] {
	const pages = source.getPages();
	return pages
		.filter(
			(page) =>
				page.slugs[0] === "plugins" &&
				page.slugs.length === 2 &&
				page.slugs[1] !== "community-plugins",
		)
		.map((page) => {
			const slug = page.slugs[1];
			const meta = pluginMeta[slug];
			return {
				name: page.data.title,
				slug,
				description: page.data.description ?? "",
				tagline: meta?.tagline ?? page.data.description ?? "",
				category: meta?.category ?? "Utility",
				type: "official" as const,
				href: `/docs/plugins/${slug}`,
				icon: meta?.icon ?? "Puzzle",
			};
		});
}

export function getCommunityPlugins(): Plugin[] {
	return communityPlugins.map((p) => ({
		name: p.name,
		slug: p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
		description: p.description,
		tagline: p.description,
		category: "Community",
		type: "community" as const,
		href: p.url,
		author: p.author.name,
		icon: "Package",
	}));
}

export function getAllPlugins(): Plugin[] {
	return [...getOfficialPlugins(), ...getCommunityPlugins()];
}
