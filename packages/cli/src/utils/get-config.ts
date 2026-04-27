import fs, { existsSync } from "node:fs";
import path from "node:path";
// @ts-expect-error
import babelPresetReact from "@babel/preset-react";
// @ts-expect-error
import babelPresetTypeScript from "@babel/preset-typescript";
import type { BetterAuthOptions } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import { loadConfig } from "c12";
import type { TsConfigResult } from "get-tsconfig";
import { createPathsMatcher, getTsconfig, parseTsconfig } from "get-tsconfig";
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

type PathsMatcher = (specifier: string) => string[];

/** Reads `references` from raw tsconfig JSON (stripped out by `parseTsconfig`). */
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

/** Recursively collects tsconfigs reachable via `references`. */
function collectReferencedTsconfigs(
	tsconfigPath: string,
	visited = new Set<string>(),
): TsConfigResult[] {
	const result: TsConfigResult[] = [];
	const refs = readRawTsconfigReferences(tsconfigPath);
	if (!refs) return result;

	const configDir = path.dirname(tsconfigPath);
	for (const ref of refs) {
		const resolvedRef = path.resolve(configDir, ref.path);
		const refTsconfigPath = resolvedRef.endsWith(".json")
			? resolvedRef
			: path.join(resolvedRef, "tsconfig.json");

		if (visited.has(refTsconfigPath)) continue;
		visited.add(refTsconfigPath);

		try {
			const refConfig = parseTsconfig(refTsconfigPath);
			result.push({ path: refTsconfigPath, config: refConfig });
		} catch {
			continue;
		}

		result.push(...collectReferencedTsconfigs(refTsconfigPath, visited));
	}
	return result;
}

/**
 * Ordered `paths` matchers from the project tsconfig and any referenced
 * tsconfigs, following TypeScript canonical resolution semantics.
 * @see https://github.com/microsoft/TypeScript/blob/main/src/compiler/moduleNameResolver.ts
 */
function collectPathsMatchers(cwd: string): PathsMatcher[] {
	const configName = fs.existsSync(path.join(cwd, "tsconfig.json"))
		? "tsconfig.json"
		: "jsconfig.json";
	const tsconfig = getTsconfig(cwd, configName);
	if (!tsconfig) return [];

	const matchers: PathsMatcher[] = [];
	try {
		const mainMatcher = createPathsMatcher(tsconfig);
		if (mainMatcher) matchers.push(mainMatcher);
		for (const refTsconfig of collectReferencedTsconfigs(tsconfig.path)) {
			const refMatcher = createPathsMatcher(refTsconfig);
			if (refMatcher) matchers.push(refMatcher);
		}
	} catch (error) {
		console.error(error);
		throw new BetterAuthError("Error parsing tsconfig.json");
	}
	return matchers;
}

/**
 * Source file extensions jiti can load. Shared between the jiti `extensions`
 * option and `resolveCandidateFile` so both stay in sync.
 */
const SOURCE_EXTENSIONS = [
	".ts",
	".tsx",
	".mts",
	".cts",
	".js",
	".jsx",
	".mjs",
	".cjs",
] as const;

const SOURCE_EXTENSIONS_SET: ReadonlySet<string> = new Set(SOURCE_EXTENSIONS);

/** Probes a candidate as-is, with known extensions, and as a directory index. */
function resolveCandidateFile(candidate: string): string | undefined {
	try {
		if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
			return candidate;
		}
	} catch {}
	// A candidate that already has a known extension is either the exact
	// target or does not exist; extension and index probing would be noise.
	if (SOURCE_EXTENSIONS_SET.has(path.extname(candidate))) {
		return undefined;
	}
	for (const ext of SOURCE_EXTENSIONS) {
		const withExt = candidate + ext;
		if (fs.existsSync(withExt)) return withExt;
	}
	for (const ext of SOURCE_EXTENSIONS) {
		const asIndex = path.join(candidate, `index${ext}`);
		if (fs.existsSync(asIndex)) return asIndex;
	}
	return undefined;
}

function resolveWithMatchers(
	specifier: string,
	matchers: PathsMatcher[],
): string | undefined {
	for (const matcher of matchers) {
		for (const candidate of matcher(specifier)) {
			const resolved = resolveCandidateFile(candidate);
			if (resolved) return resolved;
		}
	}
	return undefined;
}

interface StringLiteralNode {
	type: "StringLiteral";
	value: string;
}
interface BabelNodePath<Node> {
	node: Node;
}
interface BabelTypes {
	isIdentifier(node: unknown): node is { name: string };
	isImport(node: unknown): boolean;
	isStringLiteral(node: unknown): node is StringLiteralNode;
}

/**
 * Callees whose first string argument is a module specifier. `jitiImport` is
 * a jiti-side preprocessor artifact observed in the AST; revisit on jiti
 * major version bumps (the regression suite catches a rename but not the why).
 */
const LOADER_IDENTIFIERS = new Set(["require", "import", "jitiImport"]);

/**
 * Rewrites aliased specifiers at AST level. Required because jiti's `alias`
 * option only supports prefix matching and cannot express mid-path wildcards.
 *
 * Matchers always take precedence over native resolution, mirroring
 * TypeScript's own `paths` → `node_modules` order.
 */
function createRewriteImportPathsPlugin(matchers: PathsMatcher[]) {
	return ({ types: t }: { types: BabelTypes }) => {
		const rewrite = (source: StringLiteralNode | null | undefined): void => {
			if (!source) return;
			const resolved = resolveWithMatchers(source.value, matchers);
			if (resolved) source.value = resolved;
		};
		return {
			visitor: {
				ImportDeclaration(p: BabelNodePath<{ source: StringLiteralNode }>) {
					rewrite(p.node.source);
				},
				ExportNamedDeclaration(
					p: BabelNodePath<{ source: StringLiteralNode | null }>,
				) {
					rewrite(p.node.source);
				},
				ExportAllDeclaration(p: BabelNodePath<{ source: StringLiteralNode }>) {
					rewrite(p.node.source);
				},
				ImportExpression(p: BabelNodePath<{ source: unknown }>) {
					// Only string literal sources can be statically rewritten.
					if (t.isStringLiteral(p.node.source)) rewrite(p.node.source);
				},
				CallExpression(
					p: BabelNodePath<{
						callee: unknown;
						arguments: unknown[];
					}>,
				) {
					const { callee, arguments: args } = p.node;
					const first = args[0];
					if (!t.isStringLiteral(first)) return;
					const isKnownLoader =
						(t.isIdentifier(callee) && LOADER_IDENTIFIERS.has(callee.name)) ||
						t.isImport(callee);
					if (!isKnownLoader) return;
					rewrite(first);
				},
			},
		};
	};
}

/** Virtual module aliases; real tsconfig paths go through the babel plugin. */
function getVirtualModuleAliases(cwd: string): Record<string, string> {
	const result: Record<string, string> = {};
	addSvelteKitEnvModules(result, cwd);
	addCloudflareModules(result);
	return result;
}
/**
 * .tsx files are not supported by Jiti.
 */
const jitiOptions = (cwd: string): JitiOptions => {
	const matchers = collectPathsMatchers(cwd);
	const plugins =
		matchers.length > 0 ? [createRewriteImportPathsPlugin(matchers)] : [];
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
				plugins,
			},
		},
		extensions: [...SOURCE_EXTENSIONS],
		alias: getVirtualModuleAliases(cwd),
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
