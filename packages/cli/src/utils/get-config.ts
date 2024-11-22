import { loadConfig } from "c12";
import type { BetterAuthOptions } from "better-auth";
import { logger } from "better-auth";
import path from "path";
// @ts-ignore
import babelPresetTypescript from "@babel/preset-typescript";
// @ts-ignore
import babelPresetReact from "@babel/preset-react";
import fs from "fs";
import { BetterAuthError } from "better-auth";
import { addSvelteKitEnvModules } from "./add-svelte-kit-env-modules";
import { getTsconfig } from "get-tsconfig";

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

function getPathAliases(cwd: string): Record<string, string> | null {
	try {
		const tsConfigContent = getTsconfig();
		const paths = tsConfigContent?.config.compilerOptions?.paths || {};
		const baseUrl = tsConfigContent?.config.compilerOptions?.baseUrl || "";

		const result: Record<string, string> = {};
		const obj = Object.entries(paths) as [string, string[]][];
		for (const [alias, aliasPaths] of obj) {
			for (const aliasedPath of aliasPaths) {
				const resolvedBaseUrl = path.join(cwd, baseUrl);
				const finalAlias = alias.slice(-1) === "*" ? alias.slice(0, -1) : alias;
				const finalAliasedPath =
					aliasedPath.slice(-1) === "*"
						? aliasedPath.slice(0, -1)
						: aliasedPath;

				result[finalAlias || ""] = path.join(resolvedBaseUrl, finalAliasedPath);
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
			const resolvedPath = path.join(cwd, configPath);
			const { config } = await loadConfig<{
				auth: {
					options: BetterAuthOptions;
				};
				default?: {
					options: BetterAuthOptions;
				};
			}>({
				configFile: resolvedPath,
				dotenv: true,
				jitiOptions: jitiOptions(cwd),
			});
			if (!config.auth && !config.default) {
				logger.error(
					`[#better-auth]: Couldn't read your auth config in ${resolvedPath}. Make sure to default export your auth instance or to export as a variable named auth.`,
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
							console.log("");
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
		logger.error("Couldn't read your auth config.", e);
		process.exit(1);
	}
}

export { possiblePaths };
