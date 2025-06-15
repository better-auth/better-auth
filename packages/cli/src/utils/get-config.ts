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
import { loadConfigFromFile as loadViteConfig, runnerImport } from "vite";

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
	const resolvedPath = await resolveConfigFilePath(
		cwd,
		configPath,
		shouldThrowOnError,
	);
	const config = await loadConfigFile(cwd, resolvedPath, shouldThrowOnError);
	return config.auth?.options ?? config.default?.options ?? null;
}

type BetterAuthConfig =
	| {
			default: {
				options: BetterAuthOptions;
			};
			auth?: undefined;
	  }
	| {
			auth: {
				options: BetterAuthOptions;
			};
			default?: undefined;
	  };

async function loadConfigFile(
	cwd: string,
	configPath: string,
	throwOnError?: boolean,
) {
	const viteConfigRes = await loadViteConfig(
		{
			command: "serve",
			mode: "development",
			isSsrBuild: true,
		},
		undefined, // vite config path (optional)
		cwd, // vite project root
	);
	if (viteConfigRes) {
		logger.info("Vite config detected. Using Vite config to load config.");
		const { module: config } = await runnerImport<BetterAuthConfig>(
			configPath,
			viteConfigRes.config,
		);
		if (!config.auth && !config.default) {
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
		return config;
	}
	try {
		const { config } = await loadConfig<BetterAuthConfig>({
			configFile: configPath,
			jitiOptions: jitiOptions(cwd),
		});
		if (!config.auth && !config.default) {
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
		return config;
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
			if (throwOnError) {
				throw new Error(
					`Please remove import 'server-only' from your auth config file temporarily. The CLI cannot resolve the configuration with it included. You can re-add it after running the CLI.`,
				);
			}
			logger.error(
				`Please remove import 'server-only' from your auth config file temporarily. The CLI cannot resolve the configuration with it included. You can re-add it after running the CLI.`,
			);
			process.exit(1);
		}
		if (throwOnError) {
			throw e;
		}
		logger.error("[#better-auth]: Couldn't read your auth config.", e);
		process.exit(1);
	}
}

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
		if (existsSync(possiblePath)) {
			return path.join(cwd, possiblePath);
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
	process.exit(1);
}

export { possiblePaths };
