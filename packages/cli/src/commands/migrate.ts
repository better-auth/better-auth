import { existsSync } from "node:fs";
import path from "node:path";
import {
	createTelemetry,
	getTelemetryAuthConfig,
} from "@better-auth/telemetry";
import { getAdapter, getMigrations } from "better-auth/db";
import chalk from "chalk";
import { Command } from "commander";
import prompts from "prompts";
import yoctoSpinner from "yocto-spinner";
import * as z from "zod/v4";
import { getConfig } from "../utils/get-config";

/** @internal */
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

	const db = await getAdapter(config);

	if (!db) {
		console.error(
			"Invalid database configuration. Make sure you're not using adapters. Migrate command only works with built-in Kysely adapter.",
		);
		process.exit(1);
	}

	if (db.id !== "kysely") {
		if (db.id === "prisma") {
			console.error(
				"The migrate command only works with the built-in Kysely adapter. For Prisma, run `npx @better-auth/cli generate` to create the schema, then use Prisma's migrate or push to apply it.",
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
			console.error(
				"The migrate command only works with the built-in Kysely adapter. For Drizzle, run `npx @better-auth/cli generate` to create the schema, then use Drizzle's migrate or push to apply it.",
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
		console.error("Migrate command isn't supported for this adapter.");
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
		console.log("🚀 No migrations needed.");
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
				payload: { outcome: "aborted", config: getTelemetryAuthConfig(config) },
			});
		} catch {}
		process.exit(0);
	}

	spinner?.start("migrating...");
	await runMigrations();
	spinner.stop();
	console.log("🚀 migration was completed successfully!");
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
