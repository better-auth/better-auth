import { createRequire } from "node:module";
// @ts-expect-error
import babelPresetReact from "@babel/preset-react";
// @ts-expect-error
import babelPresetTypeScript from "@babel/preset-typescript";
import type { BetterAuthOptions } from "better-auth";
import { BetterAuthError, logger } from "better-auth";
import { loadConfig } from "c12";
import fs, { existsSync } from "fs";
import type { JitiOptions } from "jiti";
import path from "path";
// only importing the types, the actual module will be loaded from the project deps dynamically
import type * as Vite from "vite";
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
		logger.warn(`Referenced tsconfig not found: ${tsconfigPath}`);
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
		logger.warn(`Error parsing tsconfig at ${tsconfigPath}: ${error}`);
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

type BetterAuthConfig =
	| {
			options: BetterAuthOptions;
			auth?: undefined;
			default?: undefined;
	  }
	| {
			options?: undefined;
			auth?: undefined;
			default: {
				options: BetterAuthOptions;
			};
	  }
	| {
			options?: undefined;
			auth: {
				options: BetterAuthOptions;
			};
			default?: undefined;
	  };

async function resolveConfigFilePath(
	cwd: string,
	configPath?: string,
	throwOnError?: boolean,
) {
	if (configPath) {
		let resolvedPath: string;
		if (path.isAbsolute(configPath)) {
			resolvedPath = configPath;
		} else {
			resolvedPath = path.join(cwd, configPath);
		}
		if (existsSync(resolvedPath)) {
			return resolvedPath;
		} else {
			if (throwOnError) {
				throw new Error(
					`Couldn't read your auth config in ${configPath}. Make sure to default export your auth instance or to export as a variable named auth.`,
				);
			}
			logger.error(
				`[#better-auth]: Couldn't read your auth config in ${configPath}. Make sure to default export your auth instance or to export as a variable named auth.`,
			);
			process.exit(1);
		}
	}

	for (const possiblePath of possiblePaths) {
		const resolvedPath = path.join(cwd, possiblePath);
		if (existsSync(resolvedPath)) {
			return resolvedPath;
		}
	}

	if (throwOnError) {
		throw new Error(
			"Couldn't find a configuration file. Add a `auth.ts` file to your project or pass the path to the configuration file using the `--config` flag.",
		);
	}
	logger.error(
		"Couldn't find a configuration file. Add a `auth.ts` file to your project or pass the path to the configuration file using the `--config` flag.",
	);
	return null;
}

async function loadConfigWithVite(cwd: string, resolvedConfigPath: string) {
	const packageJsonPath = path.join(cwd, "package.json");
	if (existsSync(packageJsonPath)) {
		const require = createRequire(packageJsonPath);
		let vite: typeof Vite;
		try {
			vite = require("vite") as typeof Vite;
		} catch {
			return null;
		}
		const viteConfig = await vite.loadConfigFromFile(
			{
				command: "serve",
				mode: "development",
				isSsrBuild: true,
			},
			undefined, // configPath (optional)
			cwd, // configRoot
		);
		if (!viteConfig) {
			return null;
		}

		// todo: runnerImport is experimental, this check should be removed once it's stable
		if (!("runnerImport" in vite)) {
			return null;
		}

		const { module: config } = await vite.runnerImport<BetterAuthConfig>(
			resolvedConfigPath,
			viteConfig.config,
		);

		return config as BetterAuthConfig;
	}
	return null;
}

export async function getConfig({
	cwd,
	configPath,
	shouldThrowOnError = false,
}: {
	cwd: string;
	configPath?: string;
	shouldThrowOnError?: boolean;
}) {
	const resolvedConfigPath = await resolveConfigFilePath(
		cwd,
		configPath,
		shouldThrowOnError,
	);
	if (!resolvedConfigPath) return null;

	let config: BetterAuthConfig | null = null;

	// try loading the config with Vite
	config = await loadConfigWithVite(cwd, resolvedConfigPath);

	// if not found, fallback to loading with Jiti
	if (!config) {
		try {
			const jitiConfigResult = await loadConfig<BetterAuthConfig>({
				configFile: resolvedConfigPath,
				jitiOptions: jitiOptions(cwd),
			});
			config = jitiConfigResult.config;
			if (!("auth" in config) && !isDefaultExport(config)) {
				if (shouldThrowOnError) {
					throw new Error(
						"Couldn't read your auth config. Make sure to default export your auth instance or to export as a variable named auth.",
					);
				}
				logger.error(
					`[#better-auth]: Couldn't read your auth config in ${resolvedConfigPath}. Make sure to default export your auth instance or to export as a variable named auth.`,
				);
				process.exit(1);
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

	if (!config) return null;

	return "auth" in config
		? config.auth?.options
		: "default" in config
			? config.default?.options
			: config.options;
}

export { possiblePaths };
