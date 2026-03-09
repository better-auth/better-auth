import fs, { existsSync } from "node:fs";
import path from "node:path";
// @ts-expect-error
import babelPresetReact from "@babel/preset-react";
// @ts-expect-error
import babelPresetTypeScript from "@babel/preset-typescript";
import type { BetterAuthOptions } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import { loadConfig } from "c12";
import { getTsconfig, parseTsconfig } from "get-tsconfig";
import type { JitiOptions } from "jiti";
import { addCloudflareModules } from "./add-cloudflare-modules";
import { addSvelteKitEnvModules } from "./add-svelte-kit-env-modules";

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

function extractAliases(tsconfig: {
	path: string;
	config: { compilerOptions?: Record<string, unknown> };
}): Record<string, string> {
	const { paths = {}, baseUrl } = (tsconfig.config.compilerOptions || {}) as {
		paths?: Record<string, string[]>;
		baseUrl?: string;
	};
	const result: Record<string, string> = {};
	const configDir = path.dirname(tsconfig.path);
	const resolvedBaseUrl = baseUrl
		? path.resolve(configDir, baseUrl)
		: configDir;

	const obj = Object.entries(paths) as [string, string[]][];
	for (const [alias, aliasPaths] of obj) {
		for (const aliasedPath of aliasPaths) {
			const finalAlias = alias.slice(-1) === "*" ? alias.slice(0, -1) : alias;
			const finalAliasedPath =
				aliasedPath.slice(-1) === "*" ? aliasedPath.slice(0, -1) : aliasedPath;

			result[finalAlias || ""] = path.join(resolvedBaseUrl, finalAliasedPath);
		}
	}
	return result;
}

/**
 * Reads raw tsconfig JSON to get `references` (which get-tsconfig strips out).
 */
function readRawTsconfigReferences(
	tsconfigPath: string,
): Array<{ path: string }> | undefined {
	try {
		const text = fs.readFileSync(tsconfigPath, "utf-8");
		const stripped = text
			.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) =>
				g ? "" : m,
			)
			.replace(/,(?=\s*[}\]])/g, "");
		const raw = JSON.parse(stripped);
		return raw.references;
	} catch {
		return undefined;
	}
}

/**
 * Collect path aliases from tsconfig references recursively.
 */
function collectReferencesAliases(
	tsconfigPath: string,
	visited = new Set<string>(),
): Record<string, string> {
	const result: Record<string, string> = {};
	const refs = readRawTsconfigReferences(tsconfigPath);
	if (!refs) return result;

	const configDir = path.dirname(tsconfigPath);
	for (const ref of refs) {
		const resolvedRef = path.resolve(configDir, ref.path);
		let refTsconfigPath: string;
		if (resolvedRef.endsWith(".json")) {
			refTsconfigPath = resolvedRef;
		} else if (
			fs.existsSync(resolvedRef) &&
			fs.statSync(resolvedRef).isFile()
		) {
			refTsconfigPath = resolvedRef;
		} else {
			refTsconfigPath = path.join(resolvedRef, "tsconfig.json");
		}

		if (visited.has(refTsconfigPath)) continue;
		visited.add(refTsconfigPath);

		if (!fs.existsSync(refTsconfigPath)) continue;

		let refConfig: Record<string, unknown>;
		try {
			refConfig = parseTsconfig(refTsconfigPath) as Record<string, unknown>;
		} catch {
			continue;
		}

		const refAliases = extractAliases({
			path: refTsconfigPath,
			config: refConfig as { compilerOptions?: Record<string, unknown> },
		});
		for (const [alias, aliasPath] of Object.entries(refAliases)) {
			if (!(alias in result)) {
				result[alias] = aliasPath;
			}
		}

		// Recurse into nested references
		const nestedAliases = collectReferencesAliases(refTsconfigPath, visited);
		for (const [alias, aliasPath] of Object.entries(nestedAliases)) {
			if (!(alias in result)) {
				result[alias] = aliasPath;
			}
		}
	}
	return result;
}

function getPathAliases(cwd: string): Record<string, string> | null {
	const configName = fs.existsSync(path.join(cwd, "tsconfig.json"))
		? "tsconfig.json"
		: "jsconfig.json";
	const tsconfig = getTsconfig(cwd, configName);
	if (!tsconfig) {
		return null;
	}
	try {
		// Extract aliases from the resolved config (handles extends)
		const result = extractAliases(tsconfig);

		// Also collect aliases from referenced tsconfig files
		const refAliases = collectReferencesAliases(tsconfig.path);
		for (const [alias, aliasPath] of Object.entries(refAliases)) {
			if (!(alias in result)) {
				result[alias] = aliasPath;
			}
		}

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
				dotenv: {
					fileName: [".env", ".env.local"],
				},
				jitiOptions: jitiOptions(cwd),
				cwd,
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
						dotenv: {
							fileName: [".env", ".env.local"],
						},
						jitiOptions: jitiOptions(cwd),
						cwd,
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
