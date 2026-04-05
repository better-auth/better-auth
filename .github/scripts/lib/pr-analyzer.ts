/**
 * PR Analyzer — shared classification module
 *
 * Pure functions for mapping conventional commit scopes and file paths
 * to domain labels. No side effects, no network calls.
 *
 * Used by: auto-changeset.ts, release-notes.ts
 */

const SCOPE_TO_DOMAIN: Record<string, string> = {
	// core
	core: "core",
	api: "core",
	client: "core",
	cookies: "core",
	crypto: "core",
	account: "core",
	session: "core",
	instrumentation: "core",
	"last-login-method": "core",
	"redis-storage": "core",

	// database
	db: "database",
	adapters: "database",
	"drizzle-adapter": "database",
	"prisma-adapter": "database",
	"kysely-adapter": "database",
	"mongo-adapter": "database",
	"memory-adapter": "database",

	// oauth
	"oauth-proxy": "oauth",
	"one-tap": "oauth",
	"generic-oauth": "oauth",
	"social-provider": "oauth",

	// credentials
	"magic-link": "credentials",
	"email-otp": "credentials",
	"phone-number": "credentials",
	phone: "credentials",
	username: "credentials",
	anonymous: "credentials",
	siwe: "credentials",
	passkey: "credentials",

	// identity
	"oauth-provider": "identity",
	"oidc-provider": "identity",
	mcp: "identity",
	"device-authorization": "identity",

	// organization
	organization: "organization",
	admin: "organization",
	access: "organization",

	// security
	"two-factor": "security",
	"2fa": "security",
	captcha: "security",
	haveibeenpwned: "security",
	"rate-limiter": "security",

	// enterprise
	sso: "enterprise",
	scim: "enterprise",

	// payments
	stripe: "payments",
	"api-key": "payments",

	// platform
	expo: "platform",
	electron: "platform",

	// devtools
	cli: "devtools",
	telemetry: "devtools",
	i18n: "devtools",
	"test-utils": "devtools",
	"open-api": "devtools",

	// devops (filtered from release notes)
	build: "devops",
	ci: "devops",
	deps: "devops",
	"deps-dev": "devops",
	knip: "devops",

	// docs (filtered from release notes)
	docs: "docs",
	blog: "docs",
	landing: "docs",
};

const PATH_TO_DOMAIN: [string, string][] = [
	// Most specific paths first
	["packages/oauth-provider/", "identity"],
	["packages/better-auth/src/plugins/oidc-provider/", "identity"],
	["packages/better-auth/src/plugins/mcp/", "identity"],
	["packages/better-auth/src/plugins/device-authorization/", "identity"],
	["packages/better-auth/src/plugins/magic-link/", "credentials"],
	["packages/better-auth/src/plugins/email-otp/", "credentials"],
	["packages/better-auth/src/plugins/phone-number/", "credentials"],
	["packages/better-auth/src/plugins/username/", "credentials"],
	["packages/better-auth/src/plugins/anonymous/", "credentials"],
	["packages/better-auth/src/plugins/siwe/", "credentials"],
	["packages/passkey/", "credentials"],
	["packages/better-auth/src/plugins/two-factor/", "security"],
	["packages/better-auth/src/api/rate-limiter/", "security"],
	["packages/better-auth/src/plugins/captcha/", "security"],
	["packages/better-auth/src/plugins/haveibeenpwned/", "security"],
	["packages/better-auth/src/plugins/organization/", "organization"],
	["packages/better-auth/src/plugins/admin/", "organization"],
	["packages/better-auth/src/plugins/access/", "organization"],
	["packages/better-auth/src/plugins/generic-oauth/", "oauth"],
	["packages/better-auth/src/plugins/oauth-proxy/", "oauth"],
	["packages/better-auth/src/plugins/one-tap/", "oauth"],
	["packages/better-auth/src/oauth2/", "oauth"],
	["packages/core/src/social-providers/", "oauth"],
	["packages/core/src/oauth2/", "oauth"],
	["packages/sso/", "enterprise"],
	["packages/scim/", "enterprise"],
	["packages/stripe/", "payments"],
	["packages/api-key/", "payments"],
	["packages/better-auth/src/db/", "database"],
	["packages/better-auth/src/adapters/", "database"],
	["packages/drizzle-adapter/", "database"],
	["packages/prisma-adapter/", "database"],
	["packages/mongo-adapter/", "database"],
	["packages/kysely-adapter/", "database"],
	["packages/memory-adapter/", "database"],
	["packages/expo/", "platform"],
	["packages/electron/", "platform"],
	["packages/better-auth/src/integrations/", "platform"],
	["packages/cli/", "devtools"],
	["packages/better-auth/src/plugins/open-api/", "devtools"],
	["packages/telemetry/", "devtools"],
	["packages/i18n/", "devtools"],
	["packages/test-utils/", "devtools"],
	// Session-related plugins → core
	["packages/better-auth/src/plugins/jwt/", "core"],
	["packages/better-auth/src/plugins/bearer/", "core"],
	["packages/better-auth/src/plugins/multi-session/", "core"],
	["packages/better-auth/src/plugins/custom-session/", "core"],
	["packages/redis-storage/", "core"],
	// Catch-all for better-auth and core packages
	["packages/better-auth/", "core"],
	["packages/core/", "core"],
	// Non-user-facing
	["docs/", "docs"],
	["demo/", "docs"],
	[".github/", "devops"],
	["e2e/", "devops"],
];

export interface ConventionalCommit {
	type: string;
	scope: string;
	subject: string;
	breaking: boolean;
}

export function parseConventionalCommit(title: string): ConventionalCommit {
	const typeMatch = title.match(/^([a-z]+)/);
	const type = typeMatch?.[1] ?? "";
	const scopeMatch = title.match(/^[a-z]+\(([^)]+)\)/);
	const scope = scopeMatch?.[1] ?? "";
	const breaking = /^[a-z]+(\([^)]+\))?!:/.test(title);
	const subject = title.replace(/^[a-z]+(\([^)]+\))?!?:\s*/, "");
	return { type, scope, subject, breaking };
}

function scopeToDomain(scope: string): string | undefined {
	return SCOPE_TO_DOMAIN[scope];
}

function classifyDomain(filePath: string): string | undefined {
	for (const [prefix, domain] of PATH_TO_DOMAIN) {
		if (filePath.startsWith(prefix)) return domain;
	}
	return undefined;
}

export function resolveDomain(
	scope: string | undefined,
	changedFiles: string[],
): string {
	if (scope) {
		const domain = scopeToDomain(scope);
		if (domain) return domain;
	}

	const counts: Record<string, number> = {};
	for (const file of changedFiles) {
		const domain = classifyDomain(file);
		if (domain) {
			counts[domain] = (counts[domain] ?? 0) + 1;
		}
	}

	const domains = Object.keys(counts);
	if (domains.length === 0) return "devops";
	if (domains.length >= 3) return "core";

	return domains.sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))[0]!;
}

export function mapTypeToBump(
	type: string,
	breaking: boolean,
): "patch" | "minor" | "major" | "skip" {
	if (breaking) return "major";
	switch (type) {
		case "fix":
		case "perf":
		case "refactor":
			return "patch";
		case "feat":
			return "minor";
		case "chore":
		case "docs":
		case "ci":
		case "test":
		case "style":
		case "build":
			return "skip";
		default:
			return "patch";
	}
}

/** Domains in display order for release notes */
export const DOMAIN_ORDER = [
	"core",
	"database",
	"oauth",
	"credentials",
	"identity",
	"organization",
	"security",
	"enterprise",
	"payments",
	"platform",
	"devtools",
] as const;

/** Domains excluded from release notes */
export const FILTERED_DOMAINS = new Set(["docs", "devops"]);
