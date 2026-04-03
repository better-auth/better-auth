/**
 * Shared module for PR analysis and domain classification.
 * Used by auto-changeset (PR time) and release-notes (publish time).
 *
 * Classification algorithm (tested against 97 real commits):
 * 1. Scope from PR title takes priority (conventional commit scope -> c-* label)
 * 2. File-path majority vote (count files per domain, pick highest)
 * 3. Cross-cutting fallback (3+ domains touched -> c-core)
 */

export interface ConventionalCommit {
	type: string;
	scope: string | undefined;
	subject: string;
	breaking: boolean;
}

export interface Commit {
	hash: string;
	message: string;
	author?: string;
}

const SCOPE_TO_DOMAIN: Record<string, string> = {
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

	db: "c-database",
	adapters: "c-database",
	"drizzle-adapter": "c-database",
	"prisma-adapter": "c-database",
	"kysely-adapter": "c-database",
	"mongo-adapter": "c-database",
	"memory-adapter": "c-database",

	"oauth-proxy": "c-oauth",
	"one-tap": "c-oauth",
	"generic-oauth": "c-oauth",
	"social-provider": "c-oauth",

	"magic-link": "c-credentials",
	"email-otp": "c-credentials",
	"phone-number": "c-credentials",
	phone: "c-credentials",
	username: "c-credentials",
	anonymous: "c-credentials",
	siwe: "c-credentials",
	passkey: "c-credentials",

	"oauth-provider": "c-identity",
	"oidc-provider": "c-identity",
	mcp: "c-identity",
	"device-authorization": "c-identity",

	organization: "c-organization",
	admin: "c-organization",
	access: "c-organization",

	"two-factor": "c-security",
	"2fa": "c-security",
	captcha: "c-security",
	haveibeenpwned: "c-security",
	"rate-limiter": "c-security",

	sso: "c-enterprise",
	scim: "c-enterprise",

	stripe: "c-payments",
	"api-key": "c-payments",

	expo: "c-platform",
	electron: "c-platform",

	cli: "c-devtools",
	telemetry: "c-devtools",
	i18n: "c-devtools",
	"test-utils": "c-devtools",
	"open-api": "c-devtools",

	build: "c-infra",
	ci: "c-infra",
	deps: "c-infra",
	"deps-dev": "c-infra",
	knip: "c-infra",

	docs: "c-docs",
	blog: "c-docs",
	landing: "c-docs",
};

const PATH_TO_DOMAIN: [string, string][] = [
	// Identity
	["packages/oauth-provider/", "c-identity"],
	["packages/better-auth/src/plugins/oidc-provider/", "c-identity"],
	["packages/better-auth/src/plugins/mcp/", "c-identity"],
	["packages/better-auth/src/plugins/device-authorization/", "c-identity"],

	// Credentials
	["packages/better-auth/src/plugins/magic-link/", "c-credentials"],
	["packages/better-auth/src/plugins/email-otp/", "c-credentials"],
	["packages/better-auth/src/plugins/phone-number/", "c-credentials"],
	["packages/better-auth/src/plugins/username/", "c-credentials"],
	["packages/better-auth/src/plugins/anonymous/", "c-credentials"],
	["packages/better-auth/src/plugins/siwe/", "c-credentials"],
	["packages/passkey/", "c-credentials"],

	// Security
	["packages/better-auth/src/plugins/two-factor/", "c-security"],
	["packages/better-auth/src/api/rate-limiter/", "c-security"],
	["packages/better-auth/src/plugins/captcha/", "c-security"],
	["packages/better-auth/src/plugins/haveibeenpwned/", "c-security"],

	// Organization
	["packages/better-auth/src/plugins/organization/", "c-organization"],
	["packages/better-auth/src/plugins/admin/", "c-organization"],
	["packages/better-auth/src/plugins/access/", "c-organization"],

	// OAuth
	["packages/better-auth/src/plugins/generic-oauth/", "c-oauth"],
	["packages/better-auth/src/plugins/oauth-proxy/", "c-oauth"],
	["packages/better-auth/src/plugins/one-tap/", "c-oauth"],
	["packages/better-auth/src/oauth2/", "c-oauth"],
	["packages/core/src/social-providers/", "c-oauth"],
	["packages/core/src/oauth2/", "c-oauth"],

	// Enterprise
	["packages/sso/", "c-enterprise"],
	["packages/scim/", "c-enterprise"],

	// Payments
	["packages/stripe/", "c-payments"],
	["packages/api-key/", "c-payments"],

	// Database
	["packages/better-auth/src/db/", "c-database"],
	["packages/better-auth/src/adapters/", "c-database"],
	["packages/drizzle-adapter/", "c-database"],
	["packages/prisma-adapter/", "c-database"],
	["packages/mongo-adapter/", "c-database"],
	["packages/kysely-adapter/", "c-database"],
	["packages/memory-adapter/", "c-database"],

	// Platform
	["packages/expo/", "c-platform"],
	["packages/electron/", "c-platform"],
	["packages/better-auth/src/integrations/", "c-platform"],

	// Devtools
	["packages/cli/", "c-devtools"],
	["packages/better-auth/src/plugins/open-api/", "c-devtools"],
	["packages/telemetry/", "c-devtools"],
	["packages/i18n/", "c-devtools"],
	["packages/test-utils/", "c-devtools"],

	// Core (specific plugins before catch-all)
	["packages/better-auth/src/plugins/jwt/", "c-core"],
	["packages/better-auth/src/plugins/bearer/", "c-core"],
	["packages/better-auth/src/plugins/multi-session/", "c-core"],
	["packages/better-auth/src/plugins/custom-session/", "c-core"],
	["packages/redis-storage/", "c-core"],

	// Catch-alls
	["packages/better-auth/", "c-core"],
	["packages/core/", "c-core"],
	["docs/", "c-docs"],
	["demo/", "c-docs"],
	[".github/", "c-infra"],
	["e2e/", "c-infra"],
];

const DIR_TO_PACKAGE: Record<string, string> = {
	"better-auth": "better-auth",
	core: "@better-auth/core",
	cli: "auth",
	"api-key": "@better-auth/api-key",
	"drizzle-adapter": "@better-auth/drizzle-adapter",
	electron: "@better-auth/electron",
	expo: "@better-auth/expo",
	i18n: "@better-auth/i18n",
	"kysely-adapter": "@better-auth/kysely-adapter",
	"memory-adapter": "@better-auth/memory-adapter",
	"mongo-adapter": "@better-auth/mongo-adapter",
	"oauth-provider": "@better-auth/oauth-provider",
	passkey: "@better-auth/passkey",
	"prisma-adapter": "@better-auth/prisma-adapter",
	"redis-storage": "@better-auth/redis-storage",
	scim: "@better-auth/scim",
	sso: "@better-auth/sso",
	stripe: "@better-auth/stripe",
	telemetry: "@better-auth/telemetry",
	"test-utils": "@better-auth/test-utils",
};

/** Domain display order matching architecture layers */
export const DOMAIN_ORDER = [
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
] as const;

/** Human-readable domain labels */
export const DOMAIN_LABELS: Record<string, string> = {
	"c-core": "Core",
	"c-database": "Database",
	"c-oauth": "OAuth",
	"c-credentials": "Credentials",
	"c-identity": "Identity",
	"c-organization": "Organization",
	"c-security": "Security",
	"c-enterprise": "Enterprise",
	"c-payments": "Payments",
	"c-platform": "Platform",
	"c-devtools": "Devtools",
};

/** Parse a conventional commit title into its components */
export function parseConventionalCommit(title: string): ConventionalCommit {
	const match = title.match(/^(\w+)(?:\(([^)]*)\))?(!)?\s*:\s*(.+)$/);
	if (!match) {
		return {
			type: "unknown",
			scope: undefined,
			subject: title,
			breaking: false,
		};
	}
	const [, type, scope, bang, subject] = match;
	return {
		type: type!,
		scope: scope || undefined,
		subject: subject!.trim(),
		breaking: bang === "!",
	};
}

/** Map a conventional commit scope to its c-* domain label */
export function scopeToDomain(scope: string): string | undefined {
	return SCOPE_TO_DOMAIN[scope];
}

/** Classify a file path to its c-* domain label (first match wins) */
export function classifyDomain(filePath: string): string | undefined {
	for (const [prefix, domain] of PATH_TO_DOMAIN) {
		if (filePath.startsWith(prefix)) {
			return domain;
		}
	}
	return undefined;
}

/**
 * Resolve the domain for a PR/commit given its scope and changed files.
 *
 * Priority: scope lookup -> cross-cutting fallback (3+ domains) -> majority vote.
 */
export function resolveDomain(
	scope: string | undefined,
	changedFiles: string[],
): string {
	if (scope) {
		const domain = scopeToDomain(scope);
		if (domain) return domain;
	}

	const counts = new Map<string, number>();
	for (const file of changedFiles) {
		const domain = classifyDomain(file);
		if (domain) {
			counts.set(domain, (counts.get(domain) ?? 0) + 1);
		}
	}

	if (counts.size >= 3) return "c-core";

	let best = "c-core";
	let bestCount = 0;
	for (const [domain, count] of counts) {
		if (count > bestCount) {
			best = domain;
			bestCount = count;
		}
	}
	return best;
}

/** Map conventional commit type + breaking flag to a changeset bump level */
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
		default:
			return "skip";
	}
}

/**
 * Extract affected npm package names from changed file paths.
 *
 * Handles the fixed group: if the only package is @better-auth/core,
 * it is replaced with better-auth (they are released together).
 */
export function detectAffectedPackages(changedFiles: string[]): string[] {
	const dirs = new Set<string>();
	for (const file of changedFiles) {
		const match = file.match(/^packages\/([^/]+)\//);
		if (match) {
			dirs.add(match[1]!);
		}
	}

	const packages: string[] = [];
	for (const dir of dirs) {
		const pkg = DIR_TO_PACKAGE[dir];
		if (pkg) {
			packages.push(pkg);
		}
	}

	// Fixed group: core alone -> better-auth
	if (packages.length === 1 && packages[0] === "@better-auth/core") {
		return ["better-auth"];
	}

	return packages.sort();
}

/**
 * Cancel revert chains: if commit A says 'Revert "X"' and commit B
 * has message X, remove both from the list.
 */
export function cancelReverts(commits: Commit[]): Commit[] {
	const revertPattern = /^Revert "(.+)"$/;
	const reverted = new Set<string>();
	const revertHashes = new Set<string>();

	// First pass: find all revert commits and their targets
	for (const commit of commits) {
		const match = commit.message.match(revertPattern);
		if (match) {
			reverted.add(match[1]!);
			revertHashes.add(commit.hash);
		}
	}

	// Second pass: remove both the revert and the reverted commit
	return commits.filter((commit) => {
		if (revertHashes.has(commit.hash)) return false;
		if (reverted.has(commit.message)) return false;
		return true;
	});
}
