const SCOPE_TO_DOMAIN = new Map(
	Object.entries({
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
		cimd: "identity",

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
	} as const),
);

const PATH_TO_DOMAIN = [
	["packages/oauth-provider/", "identity"],
	["packages/better-auth/src/plugins/oidc-provider/", "identity"],
	["packages/better-auth/src/plugins/mcp/", "identity"],
	["packages/better-auth/src/plugins/device-authorization/", "identity"],
	["packages/cimd/", "identity"],
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
] as const;

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
		const domain = SCOPE_TO_DOMAIN.get(scope);
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
	if (breaking) return "minor";
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

export const FILTERED_DOMAINS = new Set(["docs", "devops"]);

export function isMaintenanceBranch(branch: string): boolean {
	return /^v[0-9]+\.[0-9]+\.x$/u.test(branch);
}

const SCOPE_TO_PACKAGE = new Map(
	Object.entries({
		cimd: "@better-auth/cimd",
		sso: "@better-auth/sso",
		scim: "@better-auth/scim",
		passkey: "@better-auth/passkey",
		"oauth-provider": "@better-auth/oauth-provider",
		stripe: "@better-auth/stripe",
		"api-key": "@better-auth/api-key",
		expo: "@better-auth/expo",
		electron: "@better-auth/electron",
		i18n: "@better-auth/i18n",
		"test-utils": "@better-auth/test-utils",
		"drizzle-adapter": "@better-auth/drizzle-adapter",
		"prisma-adapter": "@better-auth/prisma-adapter",
		"kysely-adapter": "@better-auth/kysely-adapter",
		"mongo-adapter": "@better-auth/mongo-adapter",
		"memory-adapter": "@better-auth/memory-adapter",
		"redis-storage": "@better-auth/redis-storage",
		cli: "auth",
	} as const),
);

/**
 * Maps file path prefixes to npm package names.
 * Order matters: more specific paths must come before catch-alls.
 */
const PATH_TO_PACKAGE = [
	["packages/cimd/", "@better-auth/cimd"],
	["packages/sso/", "@better-auth/sso"],
	["packages/scim/", "@better-auth/scim"],
	["packages/passkey/", "@better-auth/passkey"],
	["packages/oauth-provider/", "@better-auth/oauth-provider"],
	["packages/stripe/", "@better-auth/stripe"],
	["packages/api-key/", "@better-auth/api-key"],
	["packages/expo/", "@better-auth/expo"],
	["packages/electron/", "@better-auth/electron"],
	["packages/i18n/", "@better-auth/i18n"],
	["packages/redis-storage/", "@better-auth/redis-storage"],
	["packages/test-utils/", "@better-auth/test-utils"],
	["packages/telemetry/", "@better-auth/telemetry"],
	["packages/drizzle-adapter/", "@better-auth/drizzle-adapter"],
	["packages/prisma-adapter/", "@better-auth/prisma-adapter"],
	["packages/kysely-adapter/", "@better-auth/kysely-adapter"],
	["packages/mongo-adapter/", "@better-auth/mongo-adapter"],
	["packages/memory-adapter/", "@better-auth/memory-adapter"],
	// Catch-all: everything in better-auth or core maps to the main package
	["packages/better-auth/", "better-auth"],
	["packages/core/", "better-auth"],
	["packages/cli/", "auth"],
] as const;

export function resolvePackage(
	scope: string | undefined,
	changedFiles: string[],
): string {
	if (scope) {
		const pkg = SCOPE_TO_PACKAGE.get(scope);
		if (pkg) return pkg;
	}

	const counts: Record<string, number> = {};
	for (const file of changedFiles) {
		for (const [prefix, pkg] of PATH_TO_PACKAGE) {
			if (file.startsWith(prefix)) {
				counts[pkg] = (counts[pkg] ?? 0) + 1;
				break;
			}
		}
	}

	const packages = Object.keys(counts);
	if (packages.length === 0) return "better-auth";

	// If files span multiple external packages, return the one with the most hits.
	// If all files are in better-auth, return better-auth.
	return packages.sort((a, b) => {
		// Prefer non-better-auth packages (they're more specific)
		const aIsCore = a === "better-auth" ? 1 : 0;
		const bIsCore = b === "better-auth" ? 1 : 0;
		if (aIsCore !== bIsCore) return aIsCore - bIsCore;
		return (counts[b] ?? 0) - (counts[a] ?? 0);
	})[0]!;
}

export function classifyChangeType(
	type: string,
	breaking: boolean,
): "breaking" | "feat" | "fix" {
	if (breaking) return "breaking";
	if (type === "feat") return "feat";
	return "fix";
}
