import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { BetterAuthOptions } from "better-auth";
import { BetterAuthError, logger } from "better-auth";
import dotenv from "dotenv";
import { build } from "esbuild";
import { getCloudflareModules } from "./add-cloudflare-modules";
import { getSvelteKitConfig } from "./add-svelte-kit-env-modules";
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
				let finalAlias = alias.replace(/\*$/, "");
				if (finalAlias.endsWith("/")) {
					finalAlias = finalAlias.slice(0, -1);
				}
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
		return result;
	} catch (error) {
		console.error(error);
		throw new BetterAuthError("Error parsing tsconfig.json");
	}
}

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

async function bundleAndLoad(cwd: string, filePath: string) {
	const { virtualModules, aliases } = getSvelteKitConfig(cwd);
	const cloudflareModules = getCloudflareModules();
	Object.assign(virtualModules, cloudflareModules);

	const tsconfigAliases = getPathAliases(cwd);
	if (tsconfigAliases) {
		Object.assign(aliases, tsconfigAliases);
	}

	const resultFile = path.join(cwd, `better-auth-${Date.now()}.mjs`);

	try {
		await build({
			entryPoints: [filePath],
			bundle: true,
			outfile: resultFile,
			platform: "node",
			format: "esm",
			plugins: [
				{
					name: "virtual-modules",
					setup(build) {
						build.onResolve({ filter: /.*/ }, (args) => {
							if (virtualModules[args.path]) {
								return { path: args.path, namespace: "virtual-modules" };
							}
						});
						build.onLoad(
							{ filter: /.*/, namespace: "virtual-modules" },
							(args) => {
								return { contents: virtualModules[args.path], loader: "js" };
							},
						);
					},
				},
				{
					name: "make-all-packages-external",
					setup(build) {
						build.onResolve({ filter: /^[^./]|^\.[^./]|^\.\.[^/]/ }, (args) => {
							for (const alias of Object.keys(aliases)) {
								if (args.path === alias || args.path.startsWith(alias + "/")) {
									return null;
								}
							}
							return { external: true };
						});
					},
				},
			],
			alias: aliases,
		});

		const imported = await import(pathToFileURL(resultFile).href);
		return imported.default || imported;
	} finally {
		if (fs.existsSync(resultFile)) {
			fs.unlinkSync(resultFile);
		}
	}
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
	dotenv.config({ path: path.join(cwd, ".env") });
	try {
		let configFile: BetterAuthOptions | null = null;
		let resolvedPath: string | null = null;

		if (configPath) {
			resolvedPath = path.resolve(cwd, configPath);
			if (!fs.existsSync(resolvedPath)) {
				resolvedPath = null;
			}
		}

		if (!resolvedPath) {
			for (const possiblePath of possiblePaths) {
				const p = path.resolve(cwd, possiblePath);
				if (fs.existsSync(p)) {
					resolvedPath = p;
					break;
				}
			}
		}

		if (resolvedPath) {
			const config = await bundleAndLoad(cwd, resolvedPath);
			if (!("auth" in config) && !isDefaultExport(config)) {
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
			configFile = "auth" in config ? config.auth?.options : config.options;
		}

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

export { possiblePaths };
