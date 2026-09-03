import { existsSync } from "node:fs";
import path from "node:path";
import type { BetterAuthOptions } from "@better-auth/core";
import {
	createTelemetry,
	getTelemetryAuthConfig,
} from "@better-auth/telemetry";
import type {
	LegacyReleaseDataState,
	MigrationBlocker,
} from "better-auth/db/migration";
import {
	getMigrations,
	inspectLegacyReleaseDataFrom16,
	isHandledByMigrationFrom16,
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
	RELEASE_MIGRATION_ID,
	toReleaseMigrationOptions,
} from "./migration-decisions";
import {
	describeIrreversibleReleaseActions,
	interviewMigrationDecisions,
	isInterviewableBlocker,
} from "./migration-interview";
import type {
	MigrationPlan,
	ReleaseMigrationErrorBlocker,
	ReleaseMigrationPlanBlocker,
} from "./migration-plan";
import {
	createMigrationPlan,
	describeMigrationBlocker,
	UPGRADE_GUIDE_URL,
} from "./migration-plan";

function createReleaseMigrationErrorBlocker(
	error: unknown,
): ReleaseMigrationErrorBlocker {
	return {
		code: "release-migration-error",
		message: error instanceof Error ? error.message : String(error),
	};
}

async function collectReleaseMigrationBlockers(
	config: BetterAuthOptions,
	options: ReleaseMigrationOptions,
): Promise<ReleaseMigrationPlanBlocker[]> {
	try {
		return await validateMigrationFrom16(config, options);
	} catch (error) {
		return [createReleaseMigrationErrorBlocker(error)];
	}
}

async function inspectReleaseMigrationState(
	config: BetterAuthOptions,
	options: ReleaseMigrationOptions,
	blockers: ReleaseMigrationPlanBlocker[],
) {
	try {
		return await inspectLegacyReleaseDataFrom16(config, options, []);
	} catch (error) {
		const blocker = createReleaseMigrationErrorBlocker(error);
		if (
			!blockers.some(
				(candidate) =>
					candidate.code === blocker.code &&
					candidate.message === blocker.message,
			)
		) {
			blockers.push(blocker);
		}
		return undefined;
	}
}

function hasLegacyReleaseState(state: LegacyReleaseDataState | undefined) {
	return Boolean(
		state &&
			[
				state.oauthAccessToken,
				state.oauthApplication,
				state.oauthConsent,
				state.scimProvider,
			].some(Boolean),
	);
}

/** The single next step after a blocked run, told from the blockers that survived. */
function describeBlockedMigrationExit(
	releaseMigrationBlockers: ReleaseMigrationPlanBlocker[],
	migrationFile: string | undefined,
) {
	if (releaseMigrationBlockers.length === 0) {
		return `Resolve every blocker with a reviewed data migration, then run \`auth migrate apply\` again. Use \`auth migrate plan --json\` for a machine-readable plan. Upgrade guide: ${UPGRADE_GUIDE_URL}`;
	}
	if (releaseMigrationBlockers.some(isInterviewableBlocker)) {
		const decisionsFile = migrationFile || MIGRATION_DECISIONS_FILE;
		return `This database holds Better Auth 1.6 data. Run \`auth migrate apply\` in a terminal to answer these decisions, or record them in ${decisionsFile} and run \`auth migrate apply ${decisionsFile}\`. Upgrade guide: ${UPGRADE_GUIDE_URL}`;
	}
	return `Resolve every blocker above in your 1.6 data, then run \`auth migrate apply${migrationFile ? ` ${migrationFile}` : ""}\` again. Upgrade guide: ${UPGRADE_GUIDE_URL}`;
}

async function publishMigrateTelemetry(
	config: BetterAuthOptions,
	outcome: "aborted" | "migrated" | "no_changes" | "unsafe_change",
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

type MigrationInspection = Awaited<ReturnType<typeof getMigrations>>;
type MigrationCommandMode = "apply" | "plan";
type MigrationOutputFormat = "human" | "json";

interface MigrationApplicationResult {
	formatVersion: 1;
	mode: "apply";
	plan?: MigrationPlan;
	remediation?: string;
	status: "applied" | "approval-required" | "blocked" | "up-to-date";
}

function printMigrationChanges(
	toBeAdded: MigrationInspection["toBeAdded"],
	toBeAddedIndexes: MigrationInspection["toBeAddedIndexes"],
	toBeCreated: MigrationInspection["toBeCreated"],
) {
	if (
		toBeAdded.length === 0 &&
		toBeAddedIndexes.length === 0 &&
		toBeCreated.length === 0
	) {
		return;
	}
	console.log("🔑 The migration will affect the following:");

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
}

/** @internal */
export function printHumanMigrationPlan(
	migrationPlan: MigrationPlan,
	toBeAdded: MigrationInspection["toBeAdded"],
	toBeAddedIndexes: MigrationInspection["toBeAddedIndexes"],
	toBeCreated: MigrationInspection["toBeCreated"],
) {
	if (migrationPlan.status !== "up-to-date") {
		printMigrationChanges(toBeAdded, toBeAddedIndexes, toBeCreated);
	}
	console.log(
		`Target: ${migrationPlan.target.adapter}/${migrationPlan.target.dialect}`,
	);
	console.log(`Status: ${migrationPlan.status}`);
	console.log(
		`Account identity strategy: ${migrationPlan.accountIdentity.selectedStrategy} (database: ${migrationPlan.accountIdentity.detectedStrategy})`,
	);
	console.log(
		`Accounts: ${migrationPlan.accountIdentity.totalAccounts ?? 0} total, ${migrationPlan.accountIdentity.externalAccounts ?? 0} external`,
	);
	if (
		migrationPlan.accountIdentity.automaticNamespaceResolution &&
		migrationPlan.accountIdentity.automaticNamespaceResolution.total > 0
	) {
		console.log(
			`Automatic namespace resolution: ${migrationPlan.accountIdentity.automaticNamespaceResolution.resolved}/${migrationPlan.accountIdentity.automaticNamespaceResolution.total}`,
		);
	}
	console.log(
		`Projected collisions: ${migrationPlan.accountIdentity.projectedCollisions ?? 0}`,
	);
	if (migrationPlan.accountIdentity.selectedStrategy === "issuer") {
		console.log("Persisted namespace: verified issuer authority");
	} else {
		console.log("Persisted namespace: deterministic provider namespace");
	}
	if (migrationPlan.accountIdentity.compatibilityWarning) {
		console.log(
			`Warning: ${migrationPlan.accountIdentity.compatibilityWarning}`,
		);
	}
	console.log(
		`Blockers: ${migrationPlan.blockers.map(({ code }) => code).join(", ") || "none"}`,
	);
	for (const blocker of migrationPlan.blockers) {
		console.log("->", describeMigrationBlocker(blocker));
		console.log("   Remediation:", blocker.remediation.summary);
	}
	if (migrationPlan.releaseMigration) {
		console.log(`Release migration: ${migrationPlan.releaseMigration.id}`);
		for (const action of migrationPlan.releaseMigration.actions) {
			console.log("->", action);
		}
	}
	console.log("No database changes were applied.");
}

function printJson(value: MigrationApplicationResult | MigrationPlan) {
	console.log(JSON.stringify(value, null, 2));
}

/** @internal */
export async function migrateAction(opts: unknown) {
	const options = z
		.strictObject({
			approved: z.boolean().optional(),
			cwd: z.string(),
			config: z.string().optional(),
			migrationFile: z.string().trim().min(1).optional(),
			mode: z.enum(["apply", "plan"]) satisfies z.ZodType<MigrationCommandMode>,
			outputFormat: z.enum(["human", "json"]).optional() satisfies z.ZodType<
				MigrationOutputFormat | undefined
			>,
		})
		.parse(opts);
	const outputFormat = options.outputFormat || "human";

	if (
		options.mode === "apply" &&
		outputFormat === "json" &&
		!options.approved
	) {
		printJson({
			formatVersion: 1,
			mode: "apply",
			remediation: "Pass --yes to confirm a non-interactive JSON application.",
			status: "approval-required",
		});
		process.exit(1);
		return;
	}

	const cwd = path.resolve(options.cwd);
	if (!existsSync(cwd)) {
		console.error(`The directory "${cwd}" does not exist.`);
		process.exit(1);
		return;
	}

	let decisions: MigrationDecisions | undefined;
	let recordedDecisions = false;
	if (options.migrationFile) {
		try {
			decisions = await loadMigrationDecisions(
				path.resolve(cwd, options.migrationFile),
			);
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

	const spinner =
		outputFormat === "json"
			? undefined
			: yoctoSpinner({ text: "preparing migration..." }).start();

	const {
		accountIdentity,
		toBeAdded,
		toBeAddedIndexes,
		toBeCreated,
		migrationBlockers,
		migrationTarget,
		runMigrations,
		unsafeChanges,
	} = await getMigrations(config, {
		deferIndexBoundsToRelease: true,
		legacyTableNames: decisions?.legacyTableNames,
		throwOnUnsafe: false,
	}).catch((error) => {
		spinner?.stop();
		throw error;
	});
	const hasChanges =
		toBeAdded.length > 0 ||
		toBeAddedIndexes.length > 0 ||
		toBeCreated.length > 0;
	const isReleaseMigrationBlocker = (blocker: MigrationBlocker) =>
		isHandledByMigrationFrom16(config, blocker, accountIdentity);
	let releaseMigrationBlockers = await collectReleaseMigrationBlockers(
		config,
		releaseMigrationOptions,
	).catch((error) => {
		spinner?.stop();
		throw error;
	});
	let legacyReleaseState = await inspectReleaseMigrationState(
		config,
		releaseMigrationOptions,
		releaseMigrationBlockers,
	).catch((error) => {
		spinner?.stop();
		throw error;
	});
	const releaseMigration =
		hasLegacyReleaseState(legacyReleaseState) ||
		releaseMigrationBlockers.length > 0 ||
		migrationBlockers.some(isReleaseMigrationBlocker);
	const effectiveMigrationBlockers = releaseMigration
		? migrationBlockers.filter((blocker) => !isReleaseMigrationBlocker(blocker))
		: migrationBlockers;
	if (!releaseMigration) {
		releaseMigrationBlockers = [];
		legacyReleaseState = undefined;
	}
	const buildMigrationPlan = () =>
		createMigrationPlan({
			accountIdentity,
			hasChanges,
			migrationBlockers: effectiveMigrationBlockers,
			migrationTarget,
			releaseMigration: legacyReleaseState
				? {
						actions: describeIrreversibleReleaseActions(
							legacyReleaseState,
							decisions,
							accountIdentity,
						),
						id: RELEASE_MIGRATION_ID,
					}
				: undefined,
			releaseMigrationBlockers,
			toBeAdded,
			toBeAddedIndexes,
			toBeCreated,
		});
	let migrationPlan = buildMigrationPlan();

	spinner?.stop();

	if (options.mode === "plan") {
		if (outputFormat === "json") {
			printJson(migrationPlan);
		} else {
			printHumanMigrationPlan(
				migrationPlan,
				toBeAdded,
				toBeAddedIndexes,
				toBeCreated,
			);
		}
		if (migrationPlan.blockers.length > 0) {
			process.exitCode = 1;
		}
		return;
	}

	if (
		legacyReleaseState &&
		!options.migrationFile &&
		!options.approved &&
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
		legacyReleaseState = await inspectReleaseMigrationState(
			config,
			releaseMigrationOptions,
			releaseMigrationBlockers,
		);
		migrationPlan = buildMigrationPlan();
	}

	if (migrationPlan.blockers.length > 0) {
		if (outputFormat === "json") {
			printJson({
				formatVersion: 1,
				mode: "apply",
				plan: migrationPlan,
				status: "blocked",
			});
			process.exit(1);
			return;
		}
		console.error("Migration blocked. No database changes were applied.");
		for (const blocker of migrationPlan.blockers) {
			console.error(
				`-> [${blocker.code}] ${describeMigrationBlocker(blocker)}`,
			);
			console.error(`   Fix: ${blocker.remediation.summary}`);
			console.error(`   Docs: ${blocker.remediation.docs}`);
		}
		const corruptingChanges = releaseMigration ? [] : unsafeChanges;
		for (const change of corruptingChanges) {
			console.error(change);
		}
		if (corruptingChanges.length > 0) {
			console.error(
				`Run ${chalk.yellow("npx auth@latest generate")} to read the statements without executing them.`,
			);
			await publishMigrateTelemetry(config, "unsafe_change");
		}
		console.error(
			describeBlockedMigrationExit(
				releaseMigrationBlockers,
				options.migrationFile,
			),
		);
		process.exit(1);
		return;
	}

	if (!hasChanges && !releaseMigration) {
		if (outputFormat === "json") {
			printJson({
				formatVersion: 1,
				mode: "apply",
				plan: migrationPlan,
				status: "up-to-date",
			});
		} else {
			console.log("🚀 No migrations needed.");
		}
		await publishMigrateTelemetry(config, "no_changes");
		process.exit(0);
		return;
	}

	if (outputFormat === "human") {
		printMigrationChanges(toBeAdded, toBeAddedIndexes, toBeCreated);
	}

	let migrate = options.approved;
	if (!migrate) {
		if (legacyReleaseState) {
			console.log("This migration cannot be undone. It will:");
			for (const action of describeIrreversibleReleaseActions(
				legacyReleaseState,
				decisions,
				accountIdentity,
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
				`Apply the recorded decisions later with \`auth migrate apply ${MIGRATION_DECISIONS_FILE}\`.`,
			);
		}
		await publishMigrateTelemetry(config, "aborted");
		process.exit(0);
		return;
	}

	spinner?.start("migrating...");
	try {
		if (releaseMigration) {
			await migrateFrom16(config, releaseMigrationOptions);
		} else {
			await runMigrations();
		}
	} finally {
		spinner?.stop();
	}
	if (outputFormat === "json") {
		printJson({
			formatVersion: 1,
			mode: "apply",
			plan: migrationPlan,
			status: "applied",
		});
	} else {
		console.log("🚀 migration was completed successfully!");
	}
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

interface SharedMigrationCommandOptions {
	config?: string;
	cwd: string;
	json?: boolean;
}

interface ApplyMigrationCommandOptions extends SharedMigrationCommandOptions {
	y?: boolean;
	yes?: boolean;
}

function addSharedMigrationOptions(command: Command) {
	return command
		.option(
			"-c, --cwd <cwd>",
			"the working directory. defaults to the current directory.",
			process.cwd(),
		)
		.option(
			"--config <config>",
			"the path to the configuration file. defaults to the first configuration file found.",
		)
		.option("--json", "output one machine-readable JSON document");
}

function resolveApproval(options: ApplyMigrationCommandOptions) {
	if (options.y) {
		console.warn("WARNING: --y is deprecated. Use -y or --yes.");
	}
	return Boolean(options.yes || options.y);
}

function resolveSharedMigrationCommandOptions(command: Command) {
	const options = command.opts<SharedMigrationCommandOptions>();
	const parent = command.parent;
	const parentOptions = parent?.opts<SharedMigrationCommandOptions>();
	return {
		config:
			command.getOptionValueSource("config") === "cli"
				? options.config
				: parent?.getOptionValueSource("config") === "cli"
					? parentOptions?.config
					: options.config,
		cwd:
			command.getOptionValueSource("cwd") === "cli"
				? options.cwd
				: parent?.getOptionValueSource("cwd") === "cli" && parentOptions
					? parentOptions.cwd
					: options.cwd,
		json:
			command.getOptionValueSource("json") === "cli"
				? options.json
				: parent?.getOptionValueSource("json") === "cli"
					? parentOptions?.json
					: options.json,
	} satisfies SharedMigrationCommandOptions;
}

function resolveApplyMigrationCommandOptions(command: Command) {
	const sharedOptions = resolveSharedMigrationCommandOptions(command);
	const options = command.opts<ApplyMigrationCommandOptions>();
	const parent = command.parent;
	const parentOptions = parent?.opts<ApplyMigrationCommandOptions>();
	return {
		...sharedOptions,
		y:
			command.getOptionValueSource("y") === "cli"
				? options.y
				: parent?.getOptionValueSource("y") === "cli"
					? parentOptions?.y
					: options.y,
		yes:
			command.getOptionValueSource("yes") === "cli"
				? options.yes
				: parent?.getOptionValueSource("yes") === "cli"
					? parentOptions?.yes
					: options.yes,
	} satisfies ApplyMigrationCommandOptions;
}

async function legacyMigrateAction(options: ApplyMigrationCommandOptions) {
	console.warn(
		"WARNING: `auth migrate` without an action is deprecated. Use `auth migrate apply`.",
	);

	return migrateAction({
		approved: resolveApproval(options),
		cwd: options.cwd,
		config: options.config,
		mode: "apply",
		outputFormat: options.json ? "json" : "human",
	});
}

/** @internal */
export function createMigrateCommand() {
	const migratePlan = addSharedMigrationOptions(
		new Command("plan")
			.description("inspect a migration without changing the database")
			.argument(
				"[migration-file]",
				"a reviewed better-auth-migration.json file",
			),
	).action(
		async (
			migrationFile: string | undefined,
			_options: SharedMigrationCommandOptions,
			command: Command,
		) => {
			const options = resolveSharedMigrationCommandOptions(command);
			return migrateAction({
				cwd: options.cwd,
				config: options.config,
				migrationFile,
				mode: "plan",
				outputFormat: options.json ? "json" : "human",
			});
		},
	);

	const migrateApply = addSharedMigrationOptions(
		new Command("apply")
			.description("apply a migration to the database")
			.argument(
				"[migration-file]",
				"a reviewed better-auth-migration.json file",
			),
	)
		.option(
			"-y, --yes",
			"automatically accept and run migrations without prompting",
			false,
		)
		.option("--y", "(deprecated) same as --yes", false)
		.action(
			async (
				migrationFile: string | undefined,
				_options: ApplyMigrationCommandOptions,
				command: Command,
			) => {
				const options = resolveApplyMigrationCommandOptions(command);
				return migrateAction({
					approved: resolveApproval(options),
					cwd: options.cwd,
					config: options.config,
					migrationFile,
					mode: "apply",
					outputFormat: options.json ? "json" : "human",
				});
			},
		);

	return addSharedMigrationOptions(
		new Command("migrate")
			.enablePositionalOptions()
			.description("plan or apply a database migration"),
	)
		.option(
			"-y, --yes",
			"automatically accept and run migrations without prompting",
			false,
		)
		.option("--y", "(deprecated) same as --yes", false)
		.addCommand(migratePlan)
		.addCommand(migrateApply)
		.action(legacyMigrateAction);
}

export const migrate = createMigrateCommand();
