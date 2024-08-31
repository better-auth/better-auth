import { existsSync } from "node:fs";
import * as path from "node:path";
import { Command } from "commander";
import { z } from "zod";
import { migrateAll } from "../../db/migrations";
import { logger } from "../../utils/logger";
import { getConfig, possiblePaths } from "../get-config";

export const migrate = new Command()
	.name("migrate")
	.description("Migrate the database")
	.option(
		"-c, --cwd <cwd>",
		"the working directory. defaults to the current directory.",
		process.cwd(),
	)
	.option(
		"--config <config>",
		"the path to the configuration file. defaults to the first configuration file found.",
	)
	.action(async (opts) => {
		const options = z
			.object({
				cwd: z.string(),
				config: z.string().optional(),
			})
			.parse(opts);
		try {
			const cwd = path.resolve(options.cwd);
			if (!existsSync(cwd)) {
				logger.error(`The directory "${cwd}" does not exist.`);
				process.exit(1);
			}
			const config = await getConfig({ cwd, configPath: options.config });
			if (config) {
				await migrateAll(config, {
					cli: true,
				});
			} else {
				logger.error("No configuration file found.");

				logger.info(
					"Better Auth will look for a configuration file in the following directories:",
				);

				for (const possiblePath of possiblePaths) {
					logger.log(`📁 ${possiblePath}`);
				}

				logger.log(
					"if you want to use a different configuration file, you can use the --config flag.",
				);
			}
		} catch (e) {
			logger.error(e);
			throw e;
		}
	});
