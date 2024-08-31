import { Command } from "commander";
import { getConfig } from "../get-config";
import { Project } from "ts-morph";
import type { Provider } from "../../social-providers";
import * as fs from "fs/promises";
import type { BetterAuthPlugin } from "../../types/plugins";

export const exportTypes = new Command()
	.name("export")
	.description("Export types")
	.option("--config <config>", "the path to the configuration file")
	.option(
		"--cwd <cwd>",
		"the working directory. defaults to the current directory.",
		process.cwd(),
	)
	.action(async (opts) => {
		const config = await getConfig({ cwd: opts.cwd, configPath: opts.config });
		if (config?.socialProvider) {
			config.socialProvider = config.socialProvider.map((provider) => {
				if ("scopes" in provider) {
					provider.scopes = [];
				}
				if ("handler" in provider) {
					provider.handler = undefined;
				}

				return provider;
			});
		}
		if (config?.database) {
			config.database = {
				provider: "sqlite",
				url: "./db.sqlite",
			};
		}
		if (config?.socialProvider) {
			config.socialProvider = config.socialProvider.map((provider) => {
				return {
					id: provider.id,
				} as Provider;
			});
		}
		if (config?.plugins) {
			config.plugins = config.plugins.map((plugin) => {
				return {
					id: plugin.id,
					endpoints: plugin.endpoints,
				};
			});
		}
		const project = new Project();
		const sourceFile = project.createSourceFile(
			"auth.d.ts",
			(writer) =>
				writer.write(`export type Auth = ${JSON.stringify(config, null, 2)}`),
			{
				overwrite: true,
			},
		);
		await sourceFile.save();
	});
