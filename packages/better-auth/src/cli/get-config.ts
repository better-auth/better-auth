import path from "node:path";
import jiti from "jiti";
import type { BetterAuthOptions } from "../types";
import { logger } from "../utils/logger";

let possiblePaths = ["auth.ts"];

possiblePaths = [
	...possiblePaths,
	...possiblePaths.map((it) => `lib/${it}`),
	...possiblePaths.map((it) => `utils/${it}`),
];
possiblePaths = [...possiblePaths, ...possiblePaths.map((it) => `src/${it}`)];

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
			if (configPath.endsWith(".tsx")) {
				logger.error(
					"[#better-auth]: Only .ts files are supported for custom config paths.",
				);
				process.exit(1);
			} else {
				const config = (await jiti(cwd).import(
					path.join(cwd, configPath),
					{},
				)) as {
					auth: {
						options: BetterAuthOptions;
					};
					default?: {
						options: BetterAuthOptions;
					};
				};
				if (!config.auth && !config.default) {
					logger.error(
						"[#better-auth]: Couldn't read your auth config. Make sure to default export your auth instance or to export as a variable named auth.",
					);
					process.exit(1);
				}
				configFile = config.auth?.options || config.default?.options || null;
			}
		}

		if (!configFile) {
			for (const possiblePath of possiblePaths) {
				try {
					const config = (await jiti(path.join(cwd, possiblePath)).import(
						path.join(cwd, possiblePath),
						{},
					)) as {
						auth?: {
							options: BetterAuthOptions;
						};
						default?: {
							options: BetterAuthOptions;
						};
					};
					if (config) {
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
					if (
						!(e instanceof Error && e.message.includes("Cannot find module"))
					) {
						logger.error(e);
						process.exit(1);
					}
				}
			}
		}
		return configFile;
	} catch (e) {
		logger.error("Error while reading your auth config.", e);
		process.exit(1);
	}
}

export { possiblePaths };
