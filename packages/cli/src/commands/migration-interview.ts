import path from "node:path";
import type { BetterAuthOptions } from "@better-auth/core";
import type { LegacyReleaseDataState } from "better-auth/db/migration";
import {
	resolveConfiguredIssuers,
	validateMigrationFrom16,
} from "better-auth/db/migration";
import prompts from "prompts";
import type {
	MigrationDecisions,
	ReleaseMigrationOptions,
} from "./migration-decisions";
import {
	MIGRATION_DECISIONS_FILE,
	writeMigrationDecisions,
} from "./migration-decisions";
import type {
	MigrationPlan,
	ReleaseMigrationPlanBlocker,
} from "./migration-plan";

interface MigrationInterviewInput {
	blockers: ReleaseMigrationPlanBlocker[];
	config: BetterAuthOptions;
	cwd: string;
	legacyState: LegacyReleaseDataState;
	options: ReleaseMigrationOptions;
	target: MigrationPlan["target"];
}

const oauthDecisionBlockerCodes = new Set([
	"oauth-client-decision-required",
	"oauth-consent-decision-required",
	"oauth-token-decision-required",
]);

const interviewableBlockerCodes = new Set([
	...oauthDecisionBlockerCodes,
	"issuer-required",
	"legacy-table-candidate",
	"scim-decision-required",
]);

/** Whether a recorded decision can answer the blocker the release preflight raised. */
export function isInterviewableBlocker(blocker: ReleaseMigrationPlanBlocker) {
	return interviewableBlockerCodes.has(blocker.code);
}

function countOf(count: number, noun: string) {
	return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

function describeIssuerReason(
	reason: Extract<
		ReleaseMigrationPlanBlocker,
		{ code: "issuer-required" }
	>["reason"],
) {
	switch (reason) {
		case "discovery-issuer":
			return "taken from its discovery document";
		case "dynamic-issuer":
			return "resolved per sign-in";
		case "unconfigured-provider":
			return "missing from your configuration";
	}
}

type LegacyTableNames = NonNullable<MigrationDecisions["legacyTableNames"]>;

/**
 * Settles every proposed legacy table: an accepted candidate becomes the
 * model's physical name, and a model whose candidates are all rejected is
 * recorded as having none. Returns nothing when a question is cancelled.
 */
async function confirmLegacyTableCandidates(
	blockers: ReleaseMigrationPlanBlocker[],
): Promise<LegacyTableNames | undefined> {
	const candidateBlockers = blockers.flatMap((blocker) =>
		blocker.code === "legacy-table-candidate" ? [blocker] : [],
	);
	if (candidateBlockers.length === 0) return {};
	console.log(
		"These tables hold 1.6 columns under a name no 1.7 configuration declares. A table you do not confirm stays where it is and is never migrated.",
	);
	const legacyTableNames: LegacyTableNames = {};
	for (const blocker of candidateBlockers) {
		let legacyTable: string | null = null;
		for (const candidate of blocker.candidateTables) {
			const answers: Record<string, unknown> = await prompts({
				type: "confirm",
				name: "isLegacyTable",
				message: `Does "${candidate}" hold your 1.6 ${blocker.model} data?`,
				initial: true,
			});
			if (typeof answers.isLegacyTable !== "boolean") return undefined;
			if (answers.isLegacyTable) {
				legacyTable = candidate;
				break;
			}
		}
		legacyTableNames[blocker.model] = legacyTable;
	}
	return legacyTableNames;
}

function legacyTables(state: LegacyReleaseDataState) {
	return [
		state.oauthApplication,
		state.oauthAccessToken,
		state.oauthConsent,
		state.scimProvider,
	].flatMap((table) => (table ? [table] : []));
}

/**
 * Lists every account the legacy SCIM providers own, by asking the preflight
 * which accounts an empty retirement inventory leaves behind.
 */
async function inventoryScimAccountsToRetire(
	config: BetterAuthOptions,
	options: ReleaseMigrationOptions,
) {
	const blockers = await validateMigrationFrom16(config, {
		...options,
		scim: { accountIdsToRetire: [], providers: "reprovision" },
	});
	for (const blocker of blockers) {
		if (blocker.code === "scim-inventory-mismatch") {
			return blocker.missingAccountIds;
		}
	}
	return [];
}

/** Everything the release migration rewrites once it is confirmed. */
export function describeIrreversibleReleaseActions(
	state: LegacyReleaseDataState,
	decisions: MigrationDecisions | undefined,
): string[] {
	const actions: string[] = [];
	if (state.oauthApplication?.rowCount) {
		actions.push(
			`move ${countOf(state.oauthApplication.rowCount, "OAuth client")} into oauthClient and re-hash every plaintext client secret`,
		);
	}
	if (state.oauthAccessToken?.rowCount) {
		actions.push(
			`revoke ${countOf(state.oauthAccessToken.rowCount, "OAuth access token")}`,
		);
	}
	if (state.oauthConsent?.rowCount) {
		actions.push(
			decisions?.oauth?.consents === "migrate"
				? `move ${countOf(state.oauthConsent.rowCount, "stored consent")} into the 1.7 consent store`
				: `drop ${countOf(state.oauthConsent.rowCount, "stored consent")} so users grant them again`,
		);
	}
	if (state.scimProvider?.rowCount) {
		actions.push(
			`retire ${countOf(state.scimProvider.rowCount, "SCIM provider")}, delete ${countOf(decisions?.scim?.retireAccountIds.length ?? 0, "provisioned account")}, and require a full reprovision of every SCIM connection`,
		);
	}
	const renamed = legacyTables(state)
		.filter((table) => table.sourceTableNeedsRename)
		.map((table) => `${table.sourceTable} to ${table.backupTable}`);
	if (renamed.length > 0) {
		actions.push(`rename ${renamed.join(", ")}`);
	}
	actions.push(
		"write the 1.7 account identity onto every existing account row",
	);
	return actions;
}

/**
 * Asks for the release decisions this configuration cannot resolve on its own
 * and records them as the artifact a later `--plan` run replays. Returns
 * nothing when a question is cancelled.
 */
export async function interviewMigrationDecisions({
	blockers,
	config,
	cwd,
	legacyState,
	options,
	target,
}: MigrationInterviewInput): Promise<MigrationDecisions | undefined> {
	console.log(
		`This database holds Better Auth 1.6 data on ${target.adapter}/${target.dialect}.`,
	);
	for (const table of legacyTables(legacyState)) {
		if (table.rowCount === 0) continue;
		console.log(
			"->",
			`${table.sourceTable}: ${countOf(table.rowCount, "row")}`,
		);
	}
	const legacyTableNames = await confirmLegacyTableCandidates(blockers);
	if (!legacyTableNames) return undefined;
	let releaseOptions = options;
	let releaseBlockers: ReleaseMigrationPlanBlocker[] = blockers;
	if (Object.keys(legacyTableNames).length > 0) {
		releaseOptions = {
			...options,
			legacyTableNames: { ...options.legacyTableNames, ...legacyTableNames },
		};
		releaseBlockers = await validateMigrationFrom16(config, releaseOptions);
	}

	const configured = await resolveConfiguredIssuers(config);
	console.log("Issuers resolved from your configuration:");
	for (const [providerId, issuer] of Object.entries(configured.issuers).sort(
		([left], [right]) => left.localeCompare(right),
	)) {
		console.log("->", `${providerId}: ${issuer}`);
	}

	const issuerBlockers = releaseBlockers.flatMap((blocker) =>
		blocker.code === "issuer-required" ? [blocker] : [],
	);
	if (issuerBlockers.length > 0) {
		console.log(
			"1.7 matches an account by its issuer, so an issuer that differs from the one a later sign-in establishes never matches that account again.",
		);
	}
	const issuers: Record<string, string> = {};
	for (const blocker of issuerBlockers) {
		const answers: Record<string, unknown> = await prompts({
			type: "text",
			name: "issuer",
			message: `Issuer for "${blocker.providerId}" (${countOf(blocker.accountCount, "account")}, ${describeIssuerReason(blocker.reason)})`,
			validate: (value: string) =>
				value.trim().length > 0 || "Enter the issuer 1.7 establishes.",
		});
		const issuer =
			typeof answers.issuer === "string" ? answers.issuer.trim() : "";
		if (!issuer) return undefined;
		issuers[blocker.providerId] = issuer;
	}

	let consents: "migrate" | "reauthorize" = "reauthorize";
	if (
		releaseBlockers.some(
			({ code }) => code === "oauth-consent-decision-required",
		)
	) {
		const answers: Record<string, unknown> = await prompts({
			type: "select",
			name: "consents",
			message: "Stored OAuth consents",
			choices: [
				{ title: "Ask users to grant them again", value: "reauthorize" },
				{ title: "Move them into the 1.7 consent store", value: "migrate" },
			],
			initial: 0,
		});
		if (answers.consents !== "migrate" && answers.consents !== "reauthorize") {
			return undefined;
		}
		consents = answers.consents;
	}

	let scim: { retireAccountIds: string[] } | undefined;
	if (releaseBlockers.some(({ code }) => code === "scim-decision-required")) {
		const retireAccountIds = await inventoryScimAccountsToRetire(
			config,
			releaseOptions,
		);
		console.log(
			`Retiring the 1.6 SCIM providers deletes ${countOf(retireAccountIds.length, "provisioned account")} and requires a full reprovision afterwards:`,
		);
		for (const accountId of retireAccountIds) {
			console.log("->", accountId);
		}
		const answers: Record<string, unknown> = await prompts({
			type: "confirm",
			name: "retire",
			message: "Retire these SCIM accounts?",
			initial: true,
		});
		if (answers.retire !== true) return undefined;
		scim = { retireAccountIds: [...retireAccountIds] };
	}

	const decisions: MigrationDecisions = { formatVersion: 1 };
	if (Object.keys(issuers).length > 0) decisions.issuers = issuers;
	if (Object.keys(legacyTableNames).length > 0) {
		decisions.legacyTableNames = legacyTableNames;
	}
	if (releaseBlockers.some(({ code }) => oauthDecisionBlockerCodes.has(code))) {
		decisions.oauth = { consents };
	}
	if (scim) decisions.scim = scim;

	const filePath = path.resolve(cwd, MIGRATION_DECISIONS_FILE);
	await writeMigrationDecisions(filePath, decisions);
	console.log(`Recorded these decisions in ${filePath}`);
	return decisions;
}
