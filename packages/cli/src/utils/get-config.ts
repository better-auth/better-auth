import { loadConfig } from "c12";
import type { BetterAuthOptions } from "better-auth";
import { logger } from "better-auth";
import path from "path";
// @ts-ignore
import babelPresetTypeScript from "@babel/preset-typescript";
// @ts-ignore
import babelPresetReact from "@babel/preset-react";
import fs, { existsSync } from "fs";
import { BetterAuthError } from "better-auth";
import { addSvelteKitEnvModules } from "./add-svelte-kit-env-modules";
import { getTsconfigInfo } from "./get-tsconfig-info";

let possiblePaths = [
	"auth.ts",
	"auth.tsx",
	"auth.js",
	"auth.jsx",
	"auth.server.js",
	"auth.server.ts",
];

possiblePaths = [
	...possiblePaths,
	...possiblePaths.map((it) => `lib/server/${it}`),
	...possiblePaths.map((it) => `server/${it}`),
	...possiblePaths.map((it) => `lib/${it}`),
	...possiblePaths.map((it) => `utils/${it}`),
];
possiblePaths = [
	...possiblePaths,
	...possiblePaths.map((it) => `src/${it}`),
	...possiblePaths.map((it) => `app/${it}`),
];

function getPathAliases(cwd: string): Record<string, string> | null {
	const tsConfigPath = path.join(cwd, "tsconfig.json");
	if (!fs.existsSync(tsConfigPath)) {
		return null;
	}
	try {
		const tsConfig = getTsconfigInfo(cwd);
		const { paths = {}, baseUrl = "." } = tsConfig.compilerOptions || {};
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
						babelPresetTypeScript,
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
	shouldThrowOnError = false,
}: {
	cwd: string;
	configPath?: string;
	shouldThrowOnError?: boolean;
}) {
	try {
		let configFile: BetterAuthOptions | null = null;
		if (configPath) {
			let resolvedPath: string = path.join(cwd, configPath);
			if (existsSync(configPath)) resolvedPath = configPath; // If the configPath is a file, use it as is, as it means the path wasn't relative.
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
				if (shouldThrowOnError) {
					throw new Error(
						`Couldn't read your auth config in ${resolvedPath}. Make sure to default export your auth instance or to export as a variable named auth.`,
					);
				}
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
							if (shouldThrowOnError) {
								throw new Error(
									"Couldn't read your auth config. Make sure to default export your auth instance or to export as a variable named auth.",
								);
							}
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
					if (
						typeof e === "object" &&
						e &&
						"message" in e &&
						typeof e.message === "string" &&
						e.message.includes(
							"This module cannot be imported from a Client Component module",
						)
					) {
						if (shouldThrowOnError) {
							throw new Error(
								`Please remove import 'server-only' from your auth config file temporarily. The CLI cannot resolve the configuration with it included. You can re-add it after running the CLI.`,
							);
						}
						logger.error(
							`Please remove import 'server-only' from your auth config file temporarily. The CLI cannot resolve the configuration with it included. You can re-add it after running the CLI.`,
						);
						process.exit(1);
					}
					if (shouldThrowOnError) {
						throw e;
					}
					logger.error("[#better-auth]: Couldn't read your auth config.", e);
					process.exit(1);
				}
			}
		}
		return configFile;
	} catch (e) {
		if (
			typeof e === "object" &&
			e &&
			"message" in e &&
			typeof e.message === "string" &&
			e.message.includes(
				"This module cannot be imported from a Client Component module",
			)
		) {
			if (shouldThrowOnError) {
				throw new Error(
					`Please remove import 'server-only' from your auth config file temporarily. The CLI cannot resolve the configuration with it included. You can re-add it after running the CLI.`,
				);
			}
			logger.error(
				`Please remove import 'server-only' from your auth config file temporarily. The CLI cannot resolve the configuration with it included. You can re-add it after running the CLI.`,
			);
			process.exit(1);
		}
		if (shouldThrowOnError) {
			throw e;
		}

		logger.error("Couldn't read your auth config.", e);
		process.exit(1);
	}
}

/**
 * Reads drizzle.config.ts or drizzle.config.js from cwd and returns the `schema` property if present.
 * Returns undefined if no config is found or schema is not set.
 */
export async function getDrizzleConfigSchema(
	cwd: string,
): Promise<string | string[] | undefined> {
	const configFiles = [
		"drizzle.config.ts",
		"drizzle.config.mjs",
		"drizzle.config.js",
	];
	for (const file of configFiles) {
		const fullPath = path.join(cwd, file);
		if (existsSync(fullPath)) {
			if (file.endsWith(".ts")) {
				// For TypeScript files, use regex parsing
				try {
					const fileContent = await fs.promises.readFile(fullPath, "utf-8");

					const cleanContent = fileContent
						.replace(/\/\*[\s\S]*?\*\//g, "")
						.replace(/\/\/.*$/gm, "")
						.replace(/\s+/g, " ")
						.trim();

					const defineConfigMatch = cleanContent.match(
						/defineConfig\s*\(\s*\{([^}]+)\}\s*\)/,
					);
					if (defineConfigMatch && defineConfigMatch[1]) {
						const configContent = defineConfigMatch[1];

						const schemaMatch = configContent.match(
							/schema\s*:\s*(\[[^\]]+\]|"[^"]*"|'[^']*')/,
						);
						if (schemaMatch && schemaMatch[1]) {
							const schemaValue = schemaMatch[1];

							if (schemaValue.startsWith("[") && schemaValue.endsWith("]")) {
								const arrayContent = schemaValue.slice(1, -1);
								const items = arrayContent
									.split(",")
									.map((item) => item.trim().replace(/['"]/g, ""))
									.filter((item) => item.length > 0);
								return items;
							}

							if (
								(schemaValue.startsWith('"') && schemaValue.endsWith('"')) ||
								(schemaValue.startsWith("'") && schemaValue.endsWith("'"))
							) {
								return schemaValue.slice(1, -1);
							}
						}
					}

					const directMatch = cleanContent.match(
						/export\s+default\s*\{([^}]+)\}/,
					);
					if (directMatch && directMatch[1]) {
						const configContent = directMatch[1];
						const schemaMatch = configContent.match(
							/schema\s*:\s*(\[[^\]]+\]|"[^"]*"|'[^']*')/,
						);
						if (schemaMatch && schemaMatch[1]) {
							const schemaValue = schemaMatch[1];

							if (schemaValue.startsWith("[") && schemaValue.endsWith("]")) {
								const arrayContent = schemaValue.slice(1, -1);
								const items = arrayContent
									.split(",")
									.map((item) => item.trim().replace(/['"]/g, ""))
									.filter((item) => item.length > 0);
								return items;
							}

							if (
								(schemaValue.startsWith('"') && schemaValue.endsWith('"')) ||
								(schemaValue.startsWith("'") && schemaValue.endsWith("'"))
							) {
								return schemaValue.slice(1, -1);
							}
						}
					}
				} catch (e) {
					continue;
				}
			} else if (file.endsWith(".mjs")) {
				try {
					const configModule = (await import(fullPath)).default;
					if (configModule && configModule.schema) {
						return configModule.schema;
					}
				} catch (err) {
					continue;
				}
			} else {
				try {
					const configModule = require(fullPath);
					if (configModule && configModule.schema) {
						return configModule.schema;
					}
				} catch (err) {
					continue;
				}
			}
		}
	}
	return undefined;
}

export { possiblePaths };
