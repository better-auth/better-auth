import { Command } from "commander";
import { getConfig } from "../utils/get-config";
import { z } from "zod";
import { existsSync } from "fs";
import path from "path";
import { logger } from "better-auth";
import yoctoSpinner from "yocto-spinner";
import prompts from "prompts";
import fs from "fs/promises";
import chalk from "chalk";
import { getAdapter } from "better-auth/db";
import { getGenerator } from "../generators";

export async function generateAction(opts: any) {
	const options = z
		.object({
			cwd: z.string(),
			config: z.string().optional(),
			output: z.string().optional(),
			y: z.boolean().optional(),
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

	const adapter = await getAdapter(config).catch((e) => {
		logger.error(e.message);
		process.exit(1);
	});

	const spinner = yoctoSpinner({ text: "preparing schema..." }).start();

	const schema = await getGenerator({
		adapter,
		file: options.output,
		options: config,
	});

	spinner.stop();
	if (!schema.code) {
		logger.info("Your schema is already up to date.");
		process.exit(0);
	}
	if (schema.append || schema.overwrite) {
		let confirm = options.y;
		if (!confirm) {
			const response = await prompts({
				type: "confirm",
				name: "confirm",
				message: `The file ${
					schema.fileName
				} already exists. Do you want to ${chalk.yellow(
					`${schema.overwrite ? "overwrite" : "append"}`,
				)} the schema to the file?`,
			});
			confirm = response.confirm;
		}

		if (confirm) {
			const exist = existsSync(path.join(cwd, schema.fileName));
			if (!exist) {
				await fs.mkdir(path.dirname(path.join(cwd, schema.fileName)), {
					recursive: true,
				});
			}
			if (schema.overwrite) {
				await fs.writeFile(path.join(cwd, schema.fileName), schema.code);
			} else {
				await fs.appendFile(path.join(cwd, schema.fileName), schema.code);
			}
			logger.success(
				`🚀 Schema was ${
					schema.overwrite ? "overwritten" : "appended"
				} successfully!`,
			);
			process.exit(0);
		} else {
			logger.error("Schema generation aborted.");
			process.exit(1);
		}
	}

	let confirm = options.y;

	if (!confirm) {
		const response = await prompts({
			type: "confirm",
			name: "confirm",
			message: `Do you want to generate the schema to ${chalk.yellow(
				schema.fileName,
			)}?`,
		});
		confirm = response.confirm;
	}

	if (!confirm) {
		logger.error("Schema generation aborted.");
		process.exit(1);
	}

	if (!options.output) {
		const dirExist = existsSync(path.dirname(path.join(cwd, schema.fileName)));
		if (!dirExist) {
			await fs.mkdir(path.dirname(path.join(cwd, schema.fileName)), {
				recursive: true,
			});
		}
	}
	await fs.writeFile(
		options.output || path.join(cwd, schema.fileName),
		schema.code,
	);
	logger.success(`🚀 Schema was generated successfully!`);
	process.exit(0);
}

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
	.option("--output <output>", "the file to output to the generated schema")
	.option("-y, --y", "automatically answer yes to all prompts", false)
	.action(generateAction);
