import { existsSync } from "node:fs";
import path from "node:path";
import type { BetterAuthOptions } from "@better-auth/core";
import { getAuthTables } from "@better-auth/core/db";
import {
	createTelemetry,
	getTelemetryAuthConfig,
} from "@better-auth/telemetry";
import type { MigrationBlocker } from "better-auth/db/migration";
import {
	getMigrations,
	inspectLegacyReleaseDataFrom16,
	migrateFrom16,
	validateMigrationFrom16,
} from "better-auth/db/migration";
import chalk from "chalk";
import { Command } from "commander";
import prompts from "prompts";
import yoctoSpinner from "yocto-spinner";
import * as z from "zod";
import { getConfig } from "../utils/get-config";
import type {
	MigrationDecisions,
	ReleaseMigrationOptions,
} from "./migration-decisions";
import {
	loadMigrationDecisions,
	MIGRATION_DECISIONS_FILE,
	toReleaseMigrationOptions,
} from "./migration-decisions";
import {
	describeIrreversibleReleaseActions,
	interviewMigrationDecisions,
	isInterviewableBlocker,
} from "./migration-interview";
import type { ReleaseMigrationPlanBlocker } from "./migration-plan";
import {
	createMigrationPlan,
	describeMigrationBlocker,
	UPGRADE_GUIDE_URL,
} from "./migration-plan";

const releaseDataBlockerCodes = new Set([
	"reprovision-data",
	"retired-table-data",
	"table-data-conversion",
	"table-data-move",
]);

async function collectReleaseMigrationBlockers(
	config: BetterAuthOptions,
	options: ReleaseMigrationOptions,
): Promise<ReleaseMigrationPlanBlocker[]> {
	try {
		return await validateMigrationFrom16(config, options);
	} catch (error) {
		return [
			{
				code: "release-migration-error",
				message: error instanceof Error ? error.message : String(error),
			},
		];
	}
}

/** The single next step after a blocked run, told from the blockers that survived. */
function describeBlockedMigrationExit(
	releaseMigrationBlockers: ReleaseMigrationPlanBlocker[],
	planFile: string | undefined,
) {
	if (releaseMigrationBlockers.length === 0) {
		return `Resolve every blocker with a reviewed data migration, then run \`auth migrate\` again. Use \`auth migrate --json\` for a machine-readable plan. Upgrade guide: ${UPGRADE_GUIDE_URL}`;
	}
	if (releaseMigrationBlockers.some(isInterviewableBlocker)) {
		const decisionsFile = planFile || MIGRATION_DECISIONS_FILE;
		return `This database holds Better Auth 1.6 data. Run \`auth migrate\` in a terminal to answer these decisions, or record them in ${decisionsFile} and run \`auth migrate --plan ${decisionsFile}\`. Upgrade guide: ${UPGRADE_GUIDE_URL}`;
	}
	return `Resolve every blocker above in your 1.6 data, then run \`auth migrate${planFile ? ` --plan ${planFile}` : ""}\` again. Upgrade guide: ${UPGRADE_GUIDE_URL}`;
}

async function publishMigrateTelemetry(
	config: BetterAuthOptions,
	outcome: "aborted" | "migrated" | "no_changes",
) {
	try {
		const telemetry = await createTelemetry(config);
		await telemetry.publish({
			type: "cli_migrate",
			payload: {
				outcome,
				config: await getTelemetryAuthConfig(config),
			},
		});
	} catch {}
}

/** @internal */
export async function migrateAction(opts: unknown) {
	const options = z
		.object({
			cwd: z.string(),
			config: z.string().optional(),
			dryRun: z.boolean().optional(),
			json: z.boolean().optional(),
			plan: z.string().trim().min(1).optional(),
			y: z.boolean().optional(),
			yes: z.boolean().optional(),
		})
		.parse(opts);

	const cwd = path.resolve(options.cwd);
	if (!existsSync(cwd)) {
		console.error(`The directory "${cwd}" does not exist.`);
		process.exit(1);
	}

	if (options.y) {
		console.warn("WARNING: --y is deprecated. Consider -y or --yes");
		options.yes = true;
	}

	let decisions: MigrationDecisions | undefined;
	let recordedDecisions = false;
	if (options.plan) {
		try {
			decisions = await loadMigrationDecisions(path.resolve(cwd, options.plan));
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error));
			process.exit(1);
			return;
		}
	}
	let releaseMigrationOptions = toReleaseMigrationOptions(decisions);

	const config = await getConfig({
		cwd,
		configPath: options.config,
	});
	if (!config) {
		console.error(
			"No configuration file found. Add a `auth.ts` file to your project or pass the path to the configuration file using the `--config` flag.",
		);
		return;
	}

	const spinner = options.json
		? undefined
		: yoctoSpinner({ text: "preparing migration..." }).start();

	const {
		toBeAdded,
		toBeAddedIndexes,
		toBeCreated,
		migrationBlockers,
		migrationTarget,
		runMigrations,
	} = await getMigrations(config, {
		legacyTableNames: decisions?.legacyTableNames,
	});
	const hasChanges =
		toBeAdded.length > 0 ||
		toBeAddedIndexes.length > 0 ||
		toBeCreated.length > 0;
	const accountSchema = getAuthTables(config).account;
	const accountTable = accountSchema?.modelName || "account";
	const accountIdentityColumns = new Set([
		accountSchema?.fields.issuer?.fieldName || "issuer",
		accountSchema?.fields.providerAccountId?.fieldName || "providerAccountId",
	]);
	const isReleaseDataBlocker = (blocker: MigrationBlocker) =>
		releaseDataBlockerCodes.has(blocker.code) ||
		((blocker.code === "required-column-backfill" ||
			blocker.code === "required-column-constraint") &&
			blocker.table === accountTable &&
			blocker.columns.some((column) => accountIdentityColumns.has(column)));
	const releaseMigration =
		decisions !== undefined || migrationBlockers.some(isReleaseDataBlocker);
	const effectiveMigrationBlockers = releaseMigration
		? migrationBlockers.filter((blocker) => !isReleaseDataBlocker(blocker))
		: migrationBlockers;
	let releaseMigrationBlockers: ReleaseMigrationPlanBlocker[] = releaseMigration
		? await collectReleaseMigrationBlockers(config, releaseMigrationOptions)
		: [];
	const buildMigrationPlan = () =>
		createMigrationPlan({
			hasChanges,
			migrationBlockers: effectiveMigrationBlockers,
			migrationTarget,
			releaseMigrationBlockers,
			toBeAdded,
			toBeAddedIndexes,
			toBeCreated,
		});
	let migrationPlan = buildMigrationPlan();

	if (options.json) {
		console.log(JSON.stringify(migrationPlan, null, 2));
		if (migrationPlan.blockers.length > 0) {
			process.exitCode = 1;
		}
		return;
	}

	spinner?.stop();

	let legacyReleaseState =
		releaseMigration && !options.dryRun
			? await inspectLegacyReleaseDataFrom16(
					config,
					releaseMigrationOptions,
					[],
				)
			: undefined;
	if (
		legacyReleaseState &&
		!options.plan &&
		!options.yes &&
		process.stdin.isTTY &&
		releaseMigrationBlockers.some(isInterviewableBlocker)
	) {
		let interviewed: MigrationDecisions | undefined;
		try {
			interviewed = await interviewMigrationDecisions({
				blockers: releaseMigrationBlockers,
				config,
				cwd,
				legacyState: legacyReleaseState,
				options: releaseMigrationOptions,
				target: migrationTarget,
			});
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error));
			await publishMigrateTelemetry(config, "aborted");
			process.exit(1);
			return;
		}
		if (!interviewed) {
			console.log("Migration cancelled.");
			await publishMigrateTelemetry(config, "aborted");
			process.exit(0);
			return;
		}
		decisions = interviewed;
		recordedDecisions = true;
		releaseMigrationOptions = toReleaseMigrationOptions(decisions);
		releaseMigrationBlockers = await collectReleaseMigrationBlockers(
			config,
			releaseMigrationOptions,
		);
		legacyReleaseState = await inspectLegacyReleaseDataFrom16(
			config,
			releaseMigrationOptions,
			[],
		);
		migrationPlan = buildMigrationPlan();
	}

	if (migrationPlan.blockers.length > 0 && !options.dryRun) {
		console.error("Migration blocked. No database changes were applied.");
		for (const blocker of migrationPlan.blockers) {
			console.error(
				`-> [${blocker.code}] ${describeMigrationBlocker(blocker)}`,
			);
			console.error(`   Fix: ${blocker.remediation.summary}`);
			console.error(`   Docs: ${blocker.remediation.docs}`);
		}
		console.error(
			describeBlockedMigrationExit(releaseMigrationBlockers, options.plan),
		);
		process.exit(1);
		return;
	}

	if (!hasChanges && !releaseMigration) {
		console.log("🚀 No migrations needed.");
		await publishMigrateTelemetry(config, "no_changes");
		process.exit(0);
		return;
	}

	console.log(`🔑 The migration will affect the following:`);

	for (const table of [...toBeCreated, ...toBeAdded]) {
		console.log(
			"->",
			chalk.magenta(Object.keys(table.fields).join(", ")),
			chalk.white("fields on"),
			chalk.yellow(`${table.table}`),
			chalk.white("table."),
		);
	}
	for (const { index, table } of toBeAddedIndexes) {
		console.log(
			"->",
			chalk.magenta(index.columns.join(", ")),
			chalk.white(
				index.unique ? "fields in a unique index on" : "fields indexed on",
			),
			chalk.yellow(table),
			chalk.white("table."),
		);
	}

	if (options.dryRun) {
		console.log(
			`Target: ${migrationPlan.target.adapter}/${migrationPlan.target.dialect}`,
		);
		console.log(
			`Blockers: ${migrationPlan.blockers.map(({ code }) => code).join(", ") || "none"}`,
		);
		console.log("Dry run complete. No database changes were applied.");
		return;
	}

	let migrate = options.yes;
	if (!migrate) {
		if (legacyReleaseState) {
			console.log("This migration cannot be undone. It will:");
			for (const action of describeIrreversibleReleaseActions(
				legacyReleaseState,
				decisions,
			)) {
				console.log("->", action);
			}
		}
		const response = await prompts({
			type: "confirm",
			name: "migrate",
			message: "Are you sure you want to run these migrations?",
			initial: false,
		});
		migrate = response.migrate;
	}

	if (!migrate) {
		console.log("Migration cancelled.");
		if (recordedDecisions) {
			console.log(
				`Apply the recorded decisions later with \`auth migrate --plan ${MIGRATION_DECISIONS_FILE}\`.`,
			);
		}
		await publishMigrateTelemetry(config, "aborted");
		process.exit(0);
		return;
	}

	spinner?.start("migrating...");
	if (releaseMigration) {
		await migrateFrom16(config, releaseMigrationOptions);
	} else {
		await runMigrations();
	}
	spinner?.stop();
	console.log("🚀 migration was completed successfully!");
	try {
		const telemetry = await createTelemetry(config);
		await telemetry.publish({
			type: "cli_migrate",
			payload: {
				outcome: "migrated",
				config: await getTelemetryAuthConfig(config),
			},
		});
	} catch {}
	process.exit(0);
	return;
}

export const migrate = new Command("migrate")
	.option(
		"-c, --cwd <cwd>",
		"the working directory. defaults to the current directory.",
		process.cwd(),
	)
	.option(
		"--config <config>",
		"the path to the configuration file. defaults to the first configuration file found.",
	)
	.option(
		"--plan <file>",
		`apply the reviewed release decisions recorded in a ${MIGRATION_DECISIONS_FILE} file`,
	)
	.option(
		"-y, --yes",
		"automatically accept and run migrations without prompting",
		false,
	)
	.option("--dry-run", "show the migration plan without changing the database")
	.option(
		"--json",
		"print a machine-readable migration plan without changing the database",
	)
	.option("--y", "(deprecated) same as --yes", false)
	.action(migrateAction);
