import { Command } from "commander";
import * as z from "zod/v4";
import { existsSync } from "fs";
import path from "path";
import yoctoSpinner from "yocto-spinner";
import chalk from "chalk";
import prompts from "prompts";
import {
	globalLog,
	createTelemetry,
	getTelemetryAuthConfig,
} from "better-auth";
import { getAdapter, getMigrations } from "better-auth/db";
import { getConfig } from "../utils/get-config";

export async function migrateAction(opts: any) {
	const options = z
		.object({
			cwd: z.string(),
			config: z.string().optional(),
			y: z.boolean().optional(),
			yes: z.boolean().optional(),
		})
		.parse(opts);

	const cwd = path.resolve(options.cwd);
	if (!existsSync(cwd)) {
		globalLog("error", `The directory "${cwd}" does not exist.`, null);
		process.exit(1);
	}

	const config = await getConfig({
		cwd,
		configPath: options.config,
	});
	if (!config) {
		globalLog(
			"error",
			"No configuration file found. Add a `auth.ts` file to your project or pass the path to the configuration file using the `--config` flag.",
			null,
		);
		return;
	}

	const db = await getAdapter(config);

	if (!db) {
		globalLog(
			"error",
			"Invalid database configuration. Make sure you're not using adapters. Migrate command only works with built-in Kysely adapter.",
			null,
		);
		process.exit(1);
	}

	if (db.id !== "kysely") {
		if (db.id === "prisma") {
			globalLog(
				"error",
				"The migrate command only works with the built-in Kysely adapter. For Prisma, run `npx @better-auth/cli generate` to create the schema, then use Prisma’s migrate or push to apply it.",
				null,
			);
			try {
				const telemetry = await createTelemetry(config);
				await telemetry.publish({
					type: "cli_migrate",
					payload: {
						outcome: "unsupported_adapter",
						adapter: "prisma",
						config: getTelemetryAuthConfig(config),
					},
				});
			} catch {}
			process.exit(0);
		}
		if (db.id === "drizzle") {
			globalLog(
				"error",
				"The migrate command only works with the built-in Kysely adapter. For Drizzle, run `npx @better-auth/cli generate` to create the schema, then use Drizzle’s migrate or push to apply it.",
				null,
			);
			try {
				const telemetry = await createTelemetry(config);
				await telemetry.publish({
					type: "cli_migrate",
					payload: {
						outcome: "unsupported_adapter",
						adapter: "drizzle",
						config: getTelemetryAuthConfig(config),
					},
				});
			} catch {}
			process.exit(0);
		}
		globalLog(
			"error",
			"Migrate command isn't supported for this adapter.",
			null,
		);
		try {
			const telemetry = await createTelemetry(config);
			await telemetry.publish({
				type: "cli_migrate",
				payload: {
					outcome: "unsupported_adapter",
					adapter: db.id,
					config: getTelemetryAuthConfig(config),
				},
			});
		} catch {}
		process.exit(1);
	}

	const spinner = yoctoSpinner({ text: "preparing migration..." }).start();

	const { toBeAdded, toBeCreated, runMigrations } = await getMigrations(config);

	if (!toBeAdded.length && !toBeCreated.length) {
		spinner.stop();
		globalLog("info", "🚀 No migrations needed.", null);
		try {
			const telemetry = await createTelemetry(config);
			await telemetry.publish({
				type: "cli_migrate",
				payload: {
					outcome: "no_changes",
					config: getTelemetryAuthConfig(config),
				},
			});
		} catch {}
		process.exit(0);
	}

	spinner.stop();
	globalLog("info", `🔑 The migration will affect the following:`, null);

	for (const table of [...toBeCreated, ...toBeAdded]) {
		console.log(
			"->",
			chalk.magenta(Object.keys(table.fields).join(", ")),
			chalk.white("fields on"),
			chalk.yellow(`${table.table}`),
			chalk.white("table."),
		);
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
		globalLog("info", "Migration cancelled.", null);
		try {
			const telemetry = await createTelemetry(config);
			await telemetry.publish({
				type: "cli_migrate",
				payload: { outcome: "aborted", config: getTelemetryAuthConfig(config) },
			});
		} catch {}
		process.exit(0);
	}

	spinner?.start("migrating...");
	await runMigrations();
	spinner.stop();
	globalLog("info", "🚀 migration was completed successfully!", null);
	try {
		const telemetry = await createTelemetry(config);
		await telemetry.publish({
			type: "cli_migrate",
			payload: { outcome: "migrated", config: getTelemetryAuthConfig(config) },
		});
	} catch {}
	process.exit(0);
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
		"-y, --yes",
		"automatically accept and run migrations without prompting",
		false,
	)
	.option("--y", "(deprecated) same as --yes", false)
	.action(migrateAction);
