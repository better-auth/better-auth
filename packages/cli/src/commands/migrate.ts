import { existsSync } from "node:fs";
import path from "node:path";
import { getAuthTables } from "@better-auth/core/db";
import {
	createTelemetry,
	getTelemetryAuthConfig,
} from "@better-auth/telemetry";
import {
	getMigrations,
	migrateFrom16,
	validateMigrationFrom16,
} from "better-auth/db/migration";
import chalk from "chalk";
import { Command } from "commander";
import prompts from "prompts";
import yoctoSpinner from "yocto-spinner";
import * as z from "zod";
import { getConfig } from "../utils/get-config";
import { createMigrationPlan } from "./migration-plan";

/** @internal */
export async function migrateAction(opts: unknown) {
	const options = z
		.object({
			cwd: z.string(),
			config: z.string().optional(),
			dryRun: z.boolean().optional(),
			from: z.literal("1.6").optional(),
			json: z.boolean().optional(),
			accountIssuer: z.array(z.string()).optional(),
			legacyOAuthAccessTokenTable: z.string().trim().min(1).optional(),
			legacyOAuthApplicationTable: z.string().trim().min(1).optional(),
			legacyOAuthConsentTable: z.string().trim().min(1).optional(),
			legacyScimProviderTable: z.string().trim().min(1).optional(),
			migrateOAuthClients: z.boolean().optional(),
			migrateOAuthConsents: z.boolean().optional(),
			reauthorizeOAuthConsents: z.boolean().optional(),
			reprovisionScim: z.boolean().optional(),
			retireScimAccount: z.array(z.string()).optional(),
			revokeOAuthTokens: z.boolean().optional(),
			y: z.boolean().optional(),
			yes: z.boolean().optional(),
		})
		.parse(opts);
	const accountIssuers: Record<string, string> = {};
	for (const mapping of options.accountIssuer ?? []) {
		const separator = mapping.indexOf("=");
		const providerId = mapping.slice(0, separator).trim();
		const issuer = mapping.slice(separator + 1).trim();
		if (separator <= 0 || !providerId || !issuer) {
			throw new Error(
				`Invalid account issuer "${mapping}". Use providerId=issuer.`,
			);
		}
		if (accountIssuers[providerId] && accountIssuers[providerId] !== issuer) {
			throw new Error(
				`Provider "${providerId}" has more than one issuer mapping.`,
			);
		}
		accountIssuers[providerId] = issuer;
	}
	if (options.migrateOAuthConsents && options.reauthorizeOAuthConsents) {
		throw new Error(
			"Choose either --migrate-oauth-consents or --reauthorize-oauth-consents.",
		);
	}
	const legacyTableNames = {
		oauthAccessToken: options.legacyOAuthAccessTokenTable,
		oauthApplication: options.legacyOAuthApplicationTable,
		oauthConsent: options.legacyOAuthConsentTable,
		scimProvider: options.legacyScimProviderTable,
	};
	const consentStrategy = options.migrateOAuthConsents
		? ("migrate" as const)
		: options.reauthorizeOAuthConsents
			? ("reauthorize" as const)
			: undefined;
	const hasOAuthDecision =
		options.migrateOAuthClients || consentStrategy || options.revokeOAuthTokens;
	if (
		hasOAuthDecision &&
		!(
			options.migrateOAuthClients &&
			consentStrategy &&
			options.revokeOAuthTokens
		)
	) {
		throw new Error(
			"The OAuth cutover requires a client, consent, and token decision together.",
		);
	}
	const releaseMigrationOptions =
		options.from === "1.6"
			? {
					accountIssuers,
					legacyTableNames,
					oauthProvider:
						options.migrateOAuthClients &&
						consentStrategy &&
						options.revokeOAuthTokens
							? {
									clients: "migrate" as const,
									clientSecrets: "rehash-plaintext" as const,
									consents: consentStrategy,
									tokens: "revoke" as const,
								}
							: undefined,
					scim: options.reprovisionScim
						? {
								accountIdsToRetire: options.retireScimAccount ?? [],
								providers: "reprovision" as const,
							}
						: undefined,
				}
			: undefined;

	const cwd = path.resolve(options.cwd);
	if (!existsSync(cwd)) {
		console.error(`The directory "${cwd}" does not exist.`);
		process.exit(1);
	}

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
		legacyTableNames,
	});
	const hasChanges =
		toBeAdded.length > 0 ||
		toBeAddedIndexes.length > 0 ||
		toBeCreated.length > 0;
	const accountTable = getAuthTables(config).account?.modelName || "account";
	const releaseHandledBlockerCodes = new Set([
		"reprovision-data",
		"retired-table-data",
		"table-data-conversion",
		"table-data-move",
	]);
	const effectiveMigrationBlockers = releaseMigrationOptions
		? migrationBlockers.filter(
				(blocker) =>
					!releaseHandledBlockerCodes.has(blocker.code) &&
					!(
						(blocker.code === "required-column-backfill" ||
							blocker.code === "required-column-constraint") &&
						blocker.table === accountTable
					),
			)
		: migrationBlockers;
	const releaseMigrationBlockers: Array<{
		code: "release-migration-preflight";
		message: string;
	}> = [];
	if (releaseMigrationOptions) {
		try {
			await validateMigrationFrom16(config, releaseMigrationOptions);
		} catch (error) {
			releaseMigrationBlockers.push({
				code: "release-migration-preflight",
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}
	const migrationPlan = createMigrationPlan({
		hasChanges,
		migrationBlockers: effectiveMigrationBlockers,
		migrationTarget,
		releaseMigrationBlockers,
		toBeAdded,
		toBeAddedIndexes,
		toBeCreated,
	});

	if (options.json) {
		console.log(JSON.stringify(migrationPlan, null, 2));
		if (migrationPlan.blockers.length > 0) {
			process.exitCode = 1;
		}
		return;
	}

	spinner?.stop();
	if (migrationPlan.blockers.length > 0 && !options.dryRun) {
		console.error("Migration blocked. No database changes were applied.");
		for (const blocker of migrationPlan.blockers) {
			if (blocker.code === "release-migration-preflight") {
				console.error(`-> [${blocker.code}] ${blocker.message}`);
				continue;
			}
			if (blocker.code === "table-data-move") {
				console.error(
					`-> [${blocker.code}] ${blocker.sourceTable}: move rows to ${blocker.targetTable} for ${blocker.migration}.`,
				);
				continue;
			}
			if (blocker.code === "reprovision-data") {
				console.error(
					`-> [${blocker.code}] ${blocker.sourceTables.join(", ")}: back up and remove retired data, then reprovision into ${blocker.targetTables.join(", ")} for ${blocker.migration}.`,
				);
				continue;
			}
			if (blocker.code === "retired-table-data") {
				console.error(
					`-> [${blocker.code}] ${blocker.table}: remove retired token rows for ${blocker.migration}.`,
				);
				continue;
			}
			if (blocker.code === "table-data-conversion") {
				console.error(
					`-> [${blocker.code}] ${blocker.sourceTable}: convert ${blocker.conversion} into ${blocker.targetTable} for ${blocker.migration}, or require users to consent again.`,
				);
				continue;
			}
			if (blocker.code === "required-column-constraint") {
				console.error(
					`-> [${blocker.code}] ${blocker.table}: make ${blocker.columns.join(", ")} non-nullable.`,
				);
				continue;
			}
			console.error(
				`-> [${blocker.code}] ${blocker.table}: existing rows need values for ${blocker.columns.join(", ")}.`,
			);
		}
		console.error(
			"Resolve every blocker with a reviewed data migration, then run `auth migrate` again. Use `auth migrate --json` for a machine-readable plan.",
		);
		process.exit(1);
		return;
	}

	if (!hasChanges && options.from !== "1.6") {
		console.log("🚀 No migrations needed.");
		try {
			const telemetry = await createTelemetry(config);
			await telemetry.publish({
				type: "cli_migrate",
				payload: {
					outcome: "no_changes",
					config: await getTelemetryAuthConfig(config),
				},
			});
		} catch {}
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

	if (options.y) {
		console.warn("WARNING: --y is deprecated. Consider -y or --yes");
		options.yes = true;
	}

	let migrate = options.yes;
	if (!migrate) {
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
		try {
			const telemetry = await createTelemetry(config);
			await telemetry.publish({
				type: "cli_migrate",
				payload: {
					outcome: "aborted",
					config: await getTelemetryAuthConfig(config),
				},
			});
		} catch {}
		process.exit(0);
		return;
	}

	spinner?.start("migrating...");
	if (releaseMigrationOptions) {
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
	.option("--from <version>", 'run a release data migration; currently "1.6"')
	.option(
		"--account-issuer <providerId=issuer...>",
		"explicit issuer mapping for populated 1.6 account providers",
	)
	.option(
		"--migrate-oauth-clients",
		"migrate 1.6 OAuth clients and re-hash plaintext client secrets",
	)
	.option("--migrate-oauth-consents", "convert 1.6 OAuth consent scopes")
	.option(
		"--reauthorize-oauth-consents",
		"retire 1.6 OAuth consents and require consent again",
	)
	.option("--revoke-oauth-tokens", "retire all 1.6 OAuth provider tokens")
	.option(
		"--reprovision-scim",
		"retire 1.6 SCIM credentials and require full reprovisioning",
	)
	.option(
		"--retire-scim-account <accountId...>",
		"reviewed 1.6 SCIM authentication account ids to retire",
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
	.option(
		"--legacy-oauth-access-token-table <table>",
		"physical name of a customized 1.6 oauthAccessToken table",
	)
	.option(
		"--legacy-oauth-application-table <table>",
		"physical name of a customized 1.6 oauthApplication table",
	)
	.option(
		"--legacy-oauth-consent-table <table>",
		"physical name of a customized 1.6 oauthConsent table",
	)
	.option(
		"--legacy-scim-provider-table <table>",
		"physical name of a customized 1.6 scimProvider table",
	)
	.option("--y", "(deprecated) same as --yes", false)
	.action(migrateAction);
