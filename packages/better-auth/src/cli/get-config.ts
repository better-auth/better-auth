import { loadConfig } from "c12";
import type { BetterAuthOptions } from "../types";
import { logger } from "../utils/logger";
import path from "path";
// @ts-ignore
import babelPresetTypescript from "@babel/preset-typescript";
// @ts-ignore
import babelPresetReact from "@babel/preset-react";

let possiblePaths = ["auth.ts", "auth.tsx"];

possiblePaths = [
	...possiblePaths,
	...possiblePaths.map((it) => `lib/${it}`),
	...possiblePaths.map((it) => `utils/${it}`),
];
possiblePaths = [...possiblePaths, ...possiblePaths.map((it) => `src/${it}`)];

/**
 * .tsx files are not supported by Jiti.
 */
const jitiOptions = {
	transformOptions: {
		babel: {
			presets: [
				[babelPresetTypescript, { isTSX: true, allExtensions: true }],
				[babelPresetReact, { runtime: "automatic" }],
			],
		},
	},
	extensions: [".ts", ".tsx", ".js", ".jsx"],
};
export async function getConfig({
	cwd,
	configPath,
}: {
	cwd: string;
	configPath?: string;
}) {
	try {
		let configFile: BetterAuthOptions | null = null;
		if (configPath) {
			const { config } = await loadConfig<{
				auth: {
					options: BetterAuthOptions;
				};
				default?: {
					options: BetterAuthOptions;
				};
			}>({
				configFile: path.join(cwd, configPath),
				dotenv: true,
				jitiOptions,
			});
			if (!config.auth && !config.default) {
				logger.error(
					"[#better-auth]: Couldn't read your auth config. Make sure to default export your auth instance or to export as a variable named auth.",
				);
				process.exit(1);
			}
			configFile = config.auth?.options || config.default?.options || null;
		}

		if (!configFile) {
			for (const possiblePath of possiblePaths) {
				try {
					const { config } = await loadConfig<{
						auth: {
							options: BetterAuthOptions;
						};
						default?: {
							options: BetterAuthOptions;
						};
					}>({
						configFile: possiblePath,
						jitiOptions,
					});
					const hasConfig = Object.keys(config).length > 0;
					if (hasConfig) {
						configFile =
							config.auth?.options || config.default?.options || null;
						if (!configFile) {
							logger.error("[#better-auth]: Couldn't read your auth config.");
							logger.break();
							logger.info(
								"[#better-auth]: Make sure to default export your auth instance or to export as a variable named auth.",
							);
							process.exit(1);
						}
						break;
					}
				} catch (e) {
					logger.error("[#better-auth]: Couldn't read your auth config.", e);
					process.exit(1);
				}
			}
		}
		return configFile;
	} catch (e) {
		logger.error("Couldn't read your auth config.");
		process.exit(1);
	}
}

export { possiblePaths };
