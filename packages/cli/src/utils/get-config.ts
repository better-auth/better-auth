import fs, { existsSync } from "node:fs";
import path from "node:path";
// @ts-expect-error
import babelPresetReact from "@babel/preset-react";
// @ts-expect-error
import babelPresetTypeScript from "@babel/preset-typescript";
import type { BetterAuthOptions } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import { loadConfig } from "c12";
import type { JitiOptions } from "jiti";
import { addCloudflareModules } from "./add-cloudflare-modules";
import { addSvelteKitEnvModules } from "./add-svelte-kit-env-modules";
import { getTsconfigInfo } from "./get-tsconfig-info";

let possiblePaths = [
	"auth.ts",
	"auth.tsx",
	"auth.js",
	"auth.jsx",
	"auth.server.js",
	"auth.server.ts",
	"auth/index.ts",
	"auth/index.tsx",
	"auth/index.js",
	"auth/index.jsx",
	"auth/index.server.js",
	"auth/index.server.ts",
];

possiblePaths = [
	...possiblePaths,
	...possiblePaths.map((it) => `lib/server/${it}`),
	...possiblePaths.map((it) => `server/auth/${it}`),
	...possiblePaths.map((it) => `server/${it}`),
	...possiblePaths.map((it) => `auth/${it}`),
	...possiblePaths.map((it) => `lib/${it}`),
	...possiblePaths.map((it) => `utils/${it}`),
];
possiblePaths = [
	...possiblePaths,
	...possiblePaths.map((it) => `src/${it}`),
	...possiblePaths.map((it) => `app/${it}`),
];

function resolveReferencePath(configDir: string, refPath: string): string {
	const resolvedPath = path.resolve(configDir, refPath);

	// If it ends with .json, treat as direct file reference
	if (refPath.endsWith(".json")) {
		return resolvedPath;
	}

	// If the exact path exists and is a file, use it
	if (fs.existsSync(resolvedPath)) {
		try {
			const stats = fs.statSync(resolvedPath);
			if (stats.isFile()) {
				return resolvedPath;
			}
		} catch {
			// Fall through to directory handling
		}
	}

	// Otherwise, assume directory reference
	return path.resolve(configDir, refPath, "tsconfig.json");
}

function getPathAliasesRecursive(
	tsconfigPath: string,
	visited = new Set<string>(),
): Record<string, string> {
	if (visited.has(tsconfigPath)) {
		return {};
	}
	visited.add(tsconfigPath);

	if (!fs.existsSync(tsconfigPath)) {
		console.warn(`Referenced tsconfig not found: ${tsconfigPath}`);
		return {};
	}

	try {
		const tsConfig = getTsconfigInfo(undefined, tsconfigPath);
		const { paths = {}, baseUrl = "." } = tsConfig.compilerOptions || {};
		const result: Record<string, string> = {};

		const configDir = path.dirname(tsconfigPath);
		const obj = Object.entries(paths) as [string, string[]][];
		for (const [alias, aliasPaths] of obj) {
			for (const aliasedPath of aliasPaths) {
				const resolvedBaseUrl = path.resolve(configDir, baseUrl);
				const finalAlias = alias.slice(-1) === "*" ? alias.slice(0, -1) : alias;
				const finalAliasedPath =
					aliasedPath.slice(-1) === "*"
						? aliasedPath.slice(0, -1)
						: aliasedPath;

				result[finalAlias || ""] = path.join(resolvedBaseUrl, finalAliasedPath);
			}
		}

		if (tsConfig.references) {
			for (const ref of tsConfig.references) {
				const refPath = resolveReferencePath(configDir, ref.path);
				const refAliases = getPathAliasesRecursive(refPath, visited);
				for (const [alias, aliasPath] of Object.entries(refAliases)) {
					if (!(alias in result)) {
						result[alias] = aliasPath;
					}
				}
			}
		}

		return result;
	} catch (error) {
		console.warn(`Error parsing tsconfig at ${tsconfigPath}: ${error}`);
		return {};
	}
}

function getPathAliases(cwd: string): Record<string, string> | null {
	const tsConfigPath = path.join(cwd, "tsconfig.json");
	if (!fs.existsSync(tsConfigPath)) {
		return null;
	}
	try {
		const result = getPathAliasesRecursive(tsConfigPath);
		addSvelteKitEnvModules(result);
		addCloudflareModules(result);
		return result;
	} catch (error) {
		console.error(error);
		throw new BetterAuthError("Error parsing tsconfig.json");
	}
}
/**
 * .tsx files are not supported by Jiti.
 */
const jitiOptions = (cwd: string): JitiOptions => {
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

const isDefaultExport = (
	object: Record<string, unknown>,
): object is BetterAuthOptions => {
	return (
		typeof object === "object" &&
		object !== null &&
		!Array.isArray(object) &&
		Object.keys(object).length > 0 &&
		"options" in object
	);
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
			const { config } = await loadConfig<
				| {
						auth: {
							options: BetterAuthOptions;
						};
				  }
				| {
						options: BetterAuthOptions;
				  }
			>({
				configFile: resolvedPath,
				dotenv: true,
				jitiOptions: jitiOptions(cwd),
			});
			if (!("auth" in config) && !isDefaultExport(config)) {
				if (shouldThrowOnError) {
					throw new Error(
						`Couldn't read your auth config in ${resolvedPath}. Make sure to default export your auth instance or to export as a variable named auth.`,
					);
				}
				console.error(
					`[#better-auth]: Couldn't read your auth config in ${resolvedPath}. Make sure to default export your auth instance or to export as a variable named auth.`,
				);
				process.exit(1);
			}
			configFile = "auth" in config ? config.auth?.options : config.options;
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
							console.error("[#better-auth]: Couldn't read your auth config.");
							console.log("");
							console.log(
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
						console.error(
							`Please remove import 'server-only' from your auth config file temporarily. The CLI cannot resolve the configuration with it included. You can re-add it after running the CLI.`,
						);
						process.exit(1);
					}
					if (shouldThrowOnError) {
						throw e;
					}
					console.error("[#better-auth]: Couldn't read your auth config.", e);
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
			console.error(
				`Please remove import 'server-only' from your auth config file temporarily. The CLI cannot resolve the configuration with it included. You can re-add it after running the CLI.`,
			);
			process.exit(1);
		}
		if (shouldThrowOnError) {
			throw e;
		}

		console.error("Couldn't read your auth config.", e);
		process.exit(1);
	}
}
