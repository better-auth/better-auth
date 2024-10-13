import { loadConfig } from "c12";
import type { BetterAuthOptions } from "../types";
import { logger } from "../utils/logger";
import path from "path";
// @ts-ignore
import babelPresetTypescript from "@babel/preset-typescript";
// @ts-ignore
import babelPresetReact from "@babel/preset-react";
import fs from "fs";
import { BetterAuthError } from "../error/better-auth-error";
import { addSvelteKitEnvModules } from "./utils/add-svelte-kit-env-modules";
let possiblePaths = ["auth.ts", "auth.tsx"];

possiblePaths = [
	...possiblePaths,
	...possiblePaths.map((it) => `lib/server${it}`),
	...possiblePaths.map((it) => `lib/${it}`),
	...possiblePaths.map((it) => `utils/${it}`),
];
possiblePaths = [
	...possiblePaths,
	...possiblePaths.map((it) => `src/${it}`),
	...possiblePaths.map((it) => `app/${it}`),
];

function stripJsonComments(jsonString: string): string {
	return jsonString.replace(
		/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g,
		(m, g) => (g ? "" : m),
	);
}

function getPathAliases(cwd: string): Record<string, string> | null {
	const tsConfigPath = path.join(cwd, "tsconfig.json");
	if (!fs.existsSync(tsConfigPath)) {
		logger.warn("[#better-auth]: tsconfig.json not found.");
		return null;
	}
	try {
		const tsConfigContent = fs.readFileSync(tsConfigPath, "utf8");
		const strippedTsConfigContent = stripJsonComments(tsConfigContent);
		const tsConfig = JSON.parse(strippedTsConfigContent);
		const { paths = {} } = tsConfig.compilerOptions || {};

		const result: Record<string, string> = {};
		const obj = Object.entries(paths) as [string, string[]][];
		for (const [alias, aliasPaths] of obj) {
			for (const _ of aliasPaths) {
				result[alias[0]] = "../";
			}
		}
		addSvelteKitEnvModules(result);
		return result;
	} catch (error) {
		console.error(error);
		throw new BetterAuthError("Error parsing tsconfig.json");
	}
}
/**
 * .tsx files are not supported by Jiti.
 */
const jitiOptions = (cwd: string) => {
	const alias = getPathAliases(cwd) || {};
	return {
		transformOptions: {
			babel: {
				presets: [
					[
						babelPresetTypescript,
						{
							isTSX: true,
							allExtensions: true,
						},
					],
					[babelPresetReact, { runtime: "automatic" }],
				],
			},
		},
		extensions: [".ts", ".tsx", ".js", ".jsx"],
		alias,
	};
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
				jitiOptions: jitiOptions(cwd),
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
						jitiOptions: jitiOptions(cwd),
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
