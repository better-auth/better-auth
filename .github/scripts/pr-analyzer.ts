/**
 * PR Analyzer — classification module for mapping conventional commit
 * scopes and file paths to c-* domain labels.
 *
 * Pure functions, no side effects, no network calls.
 */

const SCOPE_TO_DOMAIN: Record<string, string> = {
	// c-core
	core: "c-core",
	api: "c-core",
	client: "c-core",
	cookies: "c-core",
	crypto: "c-core",
	account: "c-core",
	session: "c-core",
	instrumentation: "c-core",
	"last-login-method": "c-core",
	"redis-storage": "c-core",

	// c-database
	db: "c-database",
	adapters: "c-database",
	"drizzle-adapter": "c-database",
	"prisma-adapter": "c-database",
	"kysely-adapter": "c-database",
	"mongo-adapter": "c-database",
	"memory-adapter": "c-database",

	// c-oauth
	"oauth-proxy": "c-oauth",
	"one-tap": "c-oauth",
	"generic-oauth": "c-oauth",
	"social-provider": "c-oauth",

	// c-credentials
	"magic-link": "c-credentials",
	"email-otp": "c-credentials",
	"phone-number": "c-credentials",
	phone: "c-credentials",
	username: "c-credentials",
	anonymous: "c-credentials",
	siwe: "c-credentials",
	passkey: "c-credentials",

	// c-identity
	"oauth-provider": "c-identity",
	"oidc-provider": "c-identity",
	mcp: "c-identity",
	"device-authorization": "c-identity",

	// c-organization
	organization: "c-organization",
	admin: "c-organization",
	access: "c-organization",

	// c-security
	"two-factor": "c-security",
	"2fa": "c-security",
	captcha: "c-security",
	haveibeenpwned: "c-security",
	"rate-limiter": "c-security",

	// c-enterprise
	sso: "c-enterprise",
	scim: "c-enterprise",

	// c-payments
	stripe: "c-payments",
	"api-key": "c-payments",

	// c-platform
	expo: "c-platform",
	electron: "c-platform",

	// c-devtools
	cli: "c-devtools",
	telemetry: "c-devtools",
	i18n: "c-devtools",
	"test-utils": "c-devtools",
	"open-api": "c-devtools",

	// c-devops
	build: "c-devops",
	ci: "c-devops",
	deps: "c-devops",
	"deps-dev": "c-devops",
	knip: "c-devops",

	// c-docs
	docs: "c-docs",
	blog: "c-docs",
	landing: "c-docs",
};

const PATH_TO_DOMAIN: [string, string][] = [
	["packages/oauth-provider/", "c-identity"],
	["packages/better-auth/src/plugins/oidc-provider/", "c-identity"],
	["packages/better-auth/src/plugins/mcp/", "c-identity"],
	["packages/better-auth/src/plugins/device-authorization/", "c-identity"],
	["packages/better-auth/src/plugins/magic-link/", "c-credentials"],
	["packages/better-auth/src/plugins/email-otp/", "c-credentials"],
	["packages/better-auth/src/plugins/phone-number/", "c-credentials"],
	["packages/better-auth/src/plugins/username/", "c-credentials"],
	["packages/better-auth/src/plugins/anonymous/", "c-credentials"],
	["packages/better-auth/src/plugins/siwe/", "c-credentials"],
	["packages/passkey/", "c-credentials"],
	["packages/better-auth/src/plugins/two-factor/", "c-security"],
	["packages/better-auth/src/api/rate-limiter/", "c-security"],
	["packages/better-auth/src/plugins/captcha/", "c-security"],
	["packages/better-auth/src/plugins/haveibeenpwned/", "c-security"],
	["packages/better-auth/src/plugins/organization/", "c-organization"],
	["packages/better-auth/src/plugins/admin/", "c-organization"],
	["packages/better-auth/src/plugins/access/", "c-organization"],
	["packages/better-auth/src/plugins/generic-oauth/", "c-oauth"],
	["packages/better-auth/src/plugins/oauth-proxy/", "c-oauth"],
	["packages/better-auth/src/plugins/one-tap/", "c-oauth"],
	["packages/better-auth/src/oauth2/", "c-oauth"],
	["packages/core/src/social-providers/", "c-oauth"],
	["packages/core/src/oauth2/", "c-oauth"],
	["packages/sso/", "c-enterprise"],
	["packages/scim/", "c-enterprise"],
	["packages/stripe/", "c-payments"],
	["packages/api-key/", "c-payments"],
	["packages/better-auth/src/db/", "c-database"],
	["packages/better-auth/src/adapters/", "c-database"],
	["packages/drizzle-adapter/", "c-database"],
	["packages/prisma-adapter/", "c-database"],
	["packages/mongo-adapter/", "c-database"],
	["packages/kysely-adapter/", "c-database"],
	["packages/memory-adapter/", "c-database"],
	["packages/expo/", "c-platform"],
	["packages/electron/", "c-platform"],
	["packages/better-auth/src/integrations/", "c-platform"],
	["packages/cli/", "c-devtools"],
	["packages/better-auth/src/plugins/open-api/", "c-devtools"],
	["packages/telemetry/", "c-devtools"],
	["packages/i18n/", "c-devtools"],
	["packages/test-utils/", "c-devtools"],
	["packages/better-auth/src/plugins/jwt/", "c-core"],
	["packages/better-auth/src/plugins/bearer/", "c-core"],
	["packages/better-auth/src/plugins/multi-session/", "c-core"],
	["packages/better-auth/src/plugins/custom-session/", "c-core"],
	["packages/redis-storage/", "c-core"],
	["packages/better-auth/", "c-core"],
	["packages/core/", "c-core"],
	["docs/", "c-docs"],
	["demo/", "c-docs"],
	[".github/", "c-devops"],
	["e2e/", "c-devops"],
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

export function scopeToDomain(scope: string): string | undefined {
	return SCOPE_TO_DOMAIN[scope];
}

export function classifyDomain(filePath: string): string | undefined {
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
	if (domains.length === 0) return "c-devops";
	if (domains.length >= 3) return "c-core";

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

export const DOMAIN_LABELS = [
	"c-core",
	"c-database",
	"c-oauth",
	"c-credentials",
	"c-identity",
	"c-organization",
	"c-security",
	"c-enterprise",
	"c-payments",
	"c-platform",
	"c-devtools",
	"c-docs",
	"c-devops",
] as const;

export type DomainLabel = (typeof DOMAIN_LABELS)[number];
