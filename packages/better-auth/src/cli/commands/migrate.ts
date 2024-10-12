import { Command } from "commander";
import { getConfig } from "../get-config";
import { z } from "zod";
import { existsSync } from "fs";
import path from "path";
import { logger } from "../../utils/logger";
import { createKyselyAdapter } from "../../adapters/kysely-adapter/dialect";
import yoctoSpinner from "yocto-spinner";
import chalk from "chalk";
import prompts from "prompts";
import { getMigrations } from "../utils/get-migration";
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
	.option("--y", "")
	.action(async (opts) => {
		const options = z
			.object({
				cwd: z.string(),
				config: z.string().optional(),
			})
			.parse(opts);
		const cwd = path.resolve(options.cwd);
		if (!existsSync(cwd)) {
			logger.error(`The directory "${cwd}" does not exist.`);
			process.exit(1);
		}
		const config = await getConfig({
			cwd,
			configPath: options.config,
		});
		if (!config) {
			logger.error(
				"No configuration file found. Add a `auth.ts` file to your project or pass the path to the configuration file using the `--config` flag.",
			);
			return;
		}
		const db = await createKyselyAdapter(config).catch((e) => {
			logger.error(e.message);
			process.exit(1);
		});
		if (!db) {
			logger.error(
				"Invalid database configuration. Make sure you're not using adapters. Migrate command only works with built-in Kysely adapter.",
			);
			process.exit(1);
		}
		const spinner = yoctoSpinner({ text: "preparing migration..." }).start();

		const { toBeAdded, toBeCreated, runMigrations } =
			await getMigrations(config);

		if (!toBeAdded.length && !toBeCreated.length) {
			spinner.stop();
			logger.success("🚀 No migrations needed.");
			process.exit(0);
		}

		spinner.stop();
		logger.info(`🔑 The migration will affect the following:`);

		for (const table of [...toBeCreated, ...toBeAdded]) {
			console.log(
				"->",
				chalk.magenta(Object.keys(table.fields).join(", ")),
				chalk.white("fields on"),
				chalk.yellow(`${table.table}`),
				chalk.white("table."),
			);
		}
		const { migrate } = await prompts({
			type: "confirm",
			name: "migrate",
			message: "Are you sure you want to run these migrations?",
			initial: false,
		});
		if (!migrate) {
			logger.info("Migration cancelled.");
			process.exit(0);
		}
		spinner?.start("migrating...");
		await runMigrations();
		spinner.stop();
		logger.success("🚀 migration was completed successfully!");
		process.exit(0);
	});
