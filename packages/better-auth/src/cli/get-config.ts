import path from "node:path";
import jiti from "jiti";
import { BetterAuthOptions } from "../types";
import { logger } from "../utils/logger";

let possiblePaths = [
	"auth.ts",
	"auth.config.ts",
];

possiblePaths = [...possiblePaths, ...possiblePaths.map((it) => `lib/${it}`), ...possiblePaths.map((it) => `auth/${it}`)];
possiblePaths = [...possiblePaths.map((it) => `src/${it}`),]

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
			const config = (await jiti(cwd).import(
				path.join(cwd, configPath),
				{},
			)) as {
				auth: {
					options: BetterAuthOptions;
				};
			};
			if (!config) {
				return null;
			}
			configFile = config.auth.options;
		}

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
					configFile = config.auth?.options || config.default?.options || null;
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
				if (!(e instanceof Error && e.message.includes("Cannot find module"))) {
					logger.error(e);
					process.exit(1);
				}
			}
		}
		return configFile;
	} catch (e) {
		return null;
	}
}

export { possiblePaths };
