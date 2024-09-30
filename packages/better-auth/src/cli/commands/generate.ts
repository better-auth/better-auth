import { Command } from "commander";
import { getConfig } from "../get-config";
import { z } from "zod";
import { existsSync } from "fs";
import path from "path";
import { logger } from "../../utils/logger";
import ora from "ora";
import prompts from "prompts";
import { getAdapter } from "../../db/utils";
import fs from "fs/promises";
import chalk from "chalk";

export const generate = new Command("generate")
	.option(
		"-c, --cwd <cwd>",
		"the working directory. defaults to the current directory.",
		process.cwd(),
	)
	.option(
		"--config <config>",
		"the path to the configuration file. defaults to the first configuration file found.",
	)
	.option("--out <output>", "the file to output to the generated schema")
	.option("--y", "")
	.action(async (opts) => {
		const options = z
			.object({
				cwd: z.string(),
				config: z.string().optional(),
				out: z.string().optional(),
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
		const adapter = await getAdapter(config, true).catch((e) => {
			logger.error(e.message);
			process.exit(1);
		});

		if (!adapter.createSchema) {
			logger.error("The adapter does not support schema generation.");
			process.exit(1);
		}
		const spinner = ora("preparing schema...").start();
		const { code, fileName, append } = await adapter.createSchema(
			config,
			options.out,
		);
		spinner.stop();
		if (append) {
			const { append } = await prompts({
				type: "confirm",
				name: "append",
				message: `The file ${fileName} already exists. Do you want to ${chalk.yellow(
					"append",
				)} the schema to the file?`,
			});
			if (append) {
				await fs.appendFile(path.join(cwd, fileName), code);
				logger.success(`🚀 schema was appended successfully!`);
				process.exit(0);
			} else {
				logger.error("Schema generation aborted.");
				process.exit(1);
			}
		}

		const { confirm } = await prompts({
			type: "confirm",
			name: "confirm",
			message: `Do you want to generate the schema to ${chalk.yellow(
				fileName,
			)}?`,
		});
		if (!confirm) {
			logger.error("Schema generation aborted.");
			process.exit(1);
		}

		const dirExist = existsSync(path.dirname(path.join(cwd, fileName)));
		if (!dirExist) {
			await fs.mkdir(path.dirname(path.join(cwd, fileName)), {
				recursive: true,
			});
		}
		await fs.writeFile(options.out || path.join(cwd, fileName), code);
		logger.success(`🚀 schema was generated successfully!`);
		process.exit(0);
	});
