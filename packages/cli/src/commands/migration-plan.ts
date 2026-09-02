import type {
	getMigrations,
	MigrationBlocker,
	MigrationDecisionBlocker,
} from "better-auth/db/migration";
import { describeMigrationDecisionBlocker } from "better-auth/db/migration";
import type { RELEASE_MIGRATION_ID } from "./migration-decisions";
import { MIGRATION_DECISIONS_FILE } from "./migration-decisions";

type MigrationInspection = Awaited<ReturnType<typeof getMigrations>>;

export const UPGRADE_GUIDE_URL =
	"https://better-auth.com/docs/guides/1-7-upgrade-guide";

interface CreateMigrationPlanInput
	extends Pick<
		MigrationInspection,
		| "migrationBlockers"
		| "migrationTarget"
		| "accountIdentity"
		| "toBeAdded"
		| "toBeAddedIndexes"
		| "toBeCreated"
	> {
	hasChanges: boolean;
	releaseMigration?: ReleaseMigrationPlan | undefined;
	releaseMigrationBlockers?: ReleaseMigrationPlanBlocker[] | undefined;
}

export interface ReleaseMigrationErrorBlocker {
	code: "release-migration-error";
	message: string;
}

export type ReleaseMigrationPlanBlocker =
	| MigrationDecisionBlocker
	| ReleaseMigrationErrorBlocker;

export interface MigrationBlockerRemediation {
	/** Upgrade guide section that explains the relevant migration step. */
	docs: string;
	/** One actionable sentence naming the next step. */
	summary: string;
}

type MigrationBlockerDetail = MigrationBlocker | ReleaseMigrationPlanBlocker;

export type MigrationPlanBlocker = MigrationBlockerDetail & {
	remediation: MigrationBlockerRemediation;
};

export interface MigrationPlan {
	accountIdentity: MigrationInspection["accountIdentity"];
	blockers: MigrationPlanBlocker[];
	changes: {
		addColumns: Array<{ columns: string[]; table: string }>;
		addIndexes: Array<{
			columns: string[];
			name: string;
			table: string;
			unique: boolean;
		}>;
		createTables: Array<{ columns: string[]; table: string }>;
	};
	formatVersion: 1;
	releaseMigration?: ReleaseMigrationPlan;
	status: "blocked" | "ready" | "up-to-date";
	target: {
		adapter: string;
		dialect: "mssql" | "mysql" | "postgres" | "sqlite";
	};
}

export interface ReleaseMigrationPlan {
	actions: string[];
	id: typeof RELEASE_MIGRATION_ID;
}

/** One actionable sentence naming the blocked table and the work it needs. */
export function describeMigrationBlocker(blocker: MigrationBlockerDetail) {
	switch (blocker.code) {
		case "account-identity-strategy-mismatch":
			return blocker.malformedNamespaces > 0
				? `${blocker.table}: ${blocker.malformedNamespaces} of ${blocker.accountCount} account namespaces are malformed across providers ${blocker.affectedProviders.join(", ") || "(unknown)"}.`
				: `${blocker.table}: ${blocker.accountCount} accounts across providers ${blocker.affectedProviders.join(", ") || "(unknown)"} use ${blocker.detectedStrategy} account identity, but the configured strategy is ${blocker.configuredStrategy}.`;
		case "index-column-bounds":
		case "release-migration-error":
			return blocker.message;
		case "required-column-backfill":
			return `${blocker.table}: existing rows need values for ${blocker.columns.join(", ")}.`;
		case "required-column-constraint":
			return `${blocker.table}: make ${blocker.columns.join(", ")} non-nullable.`;
		case "reprovision-data":
			return `${blocker.sourceTables.join(", ")}: back up and remove retired data, then reprovision into ${blocker.targetTables.join(", ")} for ${blocker.migration}.`;
		case "retired-table-data":
			return `${blocker.table}: remove retired token rows for ${blocker.migration}.`;
		case "table-data-conversion":
			return `${blocker.sourceTable}: convert ${blocker.conversion} into ${blocker.targetTable} for ${blocker.migration}, or require users to consent again.`;
		case "table-data-move":
			return `${blocker.sourceTable}: move rows to ${blocker.targetTable} for ${blocker.migration}.`;
		default:
			return describeMigrationDecisionBlocker(blocker);
	}
}

function summarizeMigrationRemediation(blocker: MigrationBlockerDetail) {
	switch (blocker.code) {
		case "account-identity-strategy-mismatch":
			return blocker.malformedNamespaces > 0
				? `Repair every malformed namespace in "${blocker.table}" for the configured strategy, then run the plan again.`
				: `Keep account.identityStrategy as "${blocker.detectedStrategy === "provider-id" ? "provider-id" : "issuer"}", or perform a separate reviewed re-key migration before changing strategy.`;
		case "account-identity-collision":
			return `Merge or remove the duplicate rows for providers ${blocker.providerIds.map((providerId) => `"${providerId}"`).join(", ")} in "${blocker.table}" so issuer "${blocker.issuer}" holds provider account id "${blocker.providerAccountId}" once, then migrate again.`;
		case "account-identity-strategy-required":
			return 'Set account: { identityStrategy: "provider-id" } to preserve 1.6 account identity, then run the plan again.';
		case "account-identity-strategy-unsupported":
			return 'Set account: { identityStrategy: "provider-id" } to preserve 1.6 account identity, or perform a separately reviewed issuer re-key migration.';
		case "account-issuer-conflict":
			return `Repair account "${blocker.accountId}" so its issuer is "${blocker.requestedIssuer}", or use a separately reviewed re-key migration.`;
		case "backup-table-conflict":
			return `Drop or rename "${blocker.backupTable}" so the migration can move "${blocker.table}" aside, then migrate again.`;
		case "identifier-length-limit":
			return `Rename "${blocker.table}" to a shorter name and record it under legacyTableNames in ${MIGRATION_DECISIONS_FILE}.`;
		case "index-column-bounds":
			return `Bound the indexed string columns of "${blocker.table}" to the generated schema lengths, then run \`auth migrate apply\` again.`;
		case "legacy-table-candidate":
			return `Record which table holds the 1.6 "${blocker.model}" data under legacyTableNames in ${MIGRATION_DECISIONS_FILE}, or null when none of them does, or run \`auth migrate apply\` in a terminal to answer it there.`;
		case "oauth-client-conflict":
			return blocker.conflict === "missing-redirect-uri"
				? `Give client "${blocker.clientId}" a redirect URI in "${blocker.table}" or delete the client, then migrate again.`
				: `Align the redirect URIs of client "${blocker.clientId}" with the existing 1.7 client or delete one of them, then migrate again.`;
		case "oauth-client-decision-required":
			return `Record how the 1.6 client secrets are stored under oauth.clientSecrets in ${MIGRATION_DECISIONS_FILE}; the configured 1.7 target is "${blocker.target}".`;
		case "oauth-client-secret-target-conflict":
			return `Change oauth.clientSecrets.target in ${MIGRATION_DECISIONS_FILE} to "${blocker.configuredTarget}", or restore the reviewed OAuth provider configuration.`;
		case "oauth-client-secret-transition-unsupported":
			return `Rotate or re-register the confidential clients instead of migrating their "${blocker.source}" secrets into "${blocker.target}" storage.`;
		case "oauth-consent-conflict":
			return `Set oauth.consents to "reauthorize" in ${MIGRATION_DECISIONS_FILE}, or remove the 1.7 consent for client "${blocker.clientId}" and user "${blocker.userId}", then migrate again.`;
		case "oauth-consent-decision-required":
			return `Record oauth.consents as "migrate" or "reauthorize" in ${MIGRATION_DECISIONS_FILE}, or run \`auth migrate apply\` in a terminal to answer it there.`;
		case "oauth-token-decision-required":
			return `Record an oauth decision in ${MIGRATION_DECISIONS_FILE} to revoke these tokens, or run \`auth migrate apply\` in a terminal to answer it there.`;
		case "release-migration-error":
			return "Fix the reported problem, then run `auth migrate apply` again.";
		case "required-column-backfill":
			return `Backfill ${blocker.columns.join(", ")} for every row in "${blocker.table}", then run \`auth migrate apply\` again.`;
		case "required-column-constraint":
			return `Make ${blocker.columns.join(", ")} non-nullable in "${blocker.table}" with a reviewed migration, then run \`auth migrate apply\` again.`;
		case "scim-decision-required":
			return `Record scim.retireAccountIds in ${MIGRATION_DECISIONS_FILE}, or run \`auth migrate apply\` in a terminal to confirm the retirement inventory there.`;
		case "scim-inventory-mismatch":
			return `Set scim.retireAccountIds in ${MIGRATION_DECISIONS_FILE} to exactly the accounts this blocker reports.`;
		case "reprovision-data":
		case "retired-table-data":
		case "table-data-conversion":
		case "table-data-move":
			return "Run `auth migrate apply` and follow the guided 1.6 migration, which moves this data for you.";
	}
}

function resolveMigrationGuideAnchor(blocker: MigrationBlockerDetail) {
	switch (blocker.code) {
		case "account-identity-strategy-mismatch":
		case "account-identity-strategy-required":
		case "account-identity-strategy-unsupported":
			return "choose-account-identity-strategy";
		case "account-identity-collision":
		case "account-issuer-conflict":
			return "choose-account-identity-strategy";
		case "reprovision-data":
		case "scim-decision-required":
		case "scim-inventory-mismatch":
			return "scim-requires-full-reprovisioning";
		default:
			return "migrate-from-16-to-17";
	}
}

function resolveMigrationRemediation(
	blocker: MigrationBlockerDetail,
): MigrationBlockerRemediation {
	return {
		docs: `${UPGRADE_GUIDE_URL}#${resolveMigrationGuideAnchor(blocker)}`,
		summary: summarizeMigrationRemediation(blocker),
	};
}

function getBlockerTable(blocker: MigrationBlockerDetail) {
	if ("table" in blocker) return blocker.table;
	if ("sourceTable" in blocker) return blocker.sourceTable;
	if ("sourceTables" in blocker) return blocker.sourceTables[0] || "";
	return "";
}

function getBlockerKey(blocker: MigrationBlockerDetail) {
	return Object.entries(blocker)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([field, value]) => `${field}=${JSON.stringify(value)}`)
		.join("\u001f");
}

export function createMigrationPlan({
	accountIdentity,
	hasChanges,
	migrationBlockers,
	migrationTarget,
	releaseMigration,
	releaseMigrationBlockers = [],
	toBeAdded,
	toBeAddedIndexes,
	toBeCreated,
}: CreateMigrationPlanInput): MigrationPlan {
	const blockers: MigrationBlockerDetail[] = [
		...migrationBlockers,
		...releaseMigrationBlockers,
	];
	return {
		formatVersion: 1,
		accountIdentity,
		target: migrationTarget,
		status:
			blockers.length > 0
				? ("blocked" as const)
				: hasChanges || releaseMigration
					? ("ready" as const)
					: ("up-to-date" as const),
		changes: {
			addColumns: toBeAdded
				.map(({ fields, table }) => ({
					columns: Object.keys(fields).sort(),
					table,
				}))
				.sort((left, right) => left.table.localeCompare(right.table)),
			addIndexes: toBeAddedIndexes
				.map(({ index, name, table }) => ({
					columns: [...index.columns],
					name,
					table,
					unique: index.unique ?? false,
				}))
				.sort((left, right) => left.name.localeCompare(right.name)),
			createTables: toBeCreated
				.map(({ fields, table }) => ({
					columns: ["id", ...Object.keys(fields).sort()],
					table,
				}))
				.sort((left, right) => left.table.localeCompare(right.table)),
		},
		...(releaseMigration ? { releaseMigration } : {}),
		blockers: blockers
			.map((blocker) => {
				if (
					blocker.code === "required-column-backfill" ||
					blocker.code === "required-column-constraint"
				) {
					return {
						...blocker,
						columns: [...blocker.columns].sort(),
					};
				}
				if (blocker.code === "reprovision-data") {
					return {
						...blocker,
						sourceTables: [...blocker.sourceTables].sort(),
					};
				}
				return blocker;
			})
			.sort(
				(left, right) =>
					getBlockerTable(left).localeCompare(getBlockerTable(right)) ||
					left.code.localeCompare(right.code) ||
					getBlockerKey(left).localeCompare(getBlockerKey(right)),
			)
			.map((blocker) => ({
				...blocker,
				remediation: resolveMigrationRemediation(blocker),
			})),
	};
}
