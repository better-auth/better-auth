import fs from "node:fs";
import path from "node:path";

/**
 * Adds SvelteKit environment modules and path aliases
 * @param aliases - The aliases object to populate
 * @param cwd - Current working directory (optional, defaults to process.cwd())
 */
export function addSvelteKitEnvModules(
	aliases: Record<string, string>,
	cwd?: string,
) {
	const workingDir = cwd || process.cwd();

	// Add SvelteKit environment modules
	aliases["$env/dynamic/private"] = createDataUriModule(
		createDynamicEnvModule(),
	);
	aliases["$env/dynamic/public"] = createDataUriModule(
		createDynamicEnvModule(),
	);
	aliases["$env/static/private"] = createDataUriModule(
		createStaticEnvModule(filterPrivateEnv("PUBLIC_", "")),
	);
	aliases["$env/static/public"] = createDataUriModule(
		createStaticEnvModule(filterPublicEnv("PUBLIC_", "")),
	);

	const svelteKitAliases = getSvelteKitPathAliases(workingDir);
	Object.assign(aliases, svelteKitAliases);
}

function getSvelteKitPathAliases(cwd: string): Record<string, string> {
	const aliases: Record<string, string> = {};

	const packageJsonPath = path.join(cwd, "package.json");
	const svelteConfigPath = path.join(cwd, "svelte.config.js");
	const svelteConfigTsPath = path.join(cwd, "svelte.config.ts");

	let isSvelteKitProject = false;

	if (fs.existsSync(packageJsonPath)) {
		try {
			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
			const deps = {
				...packageJson.dependencies,
				...packageJson.devDependencies,
			};
			isSvelteKitProject = !!deps["@sveltejs/kit"];
		} catch {
			// Ignore JSON parse errors
		}
	}

	if (!isSvelteKitProject) {
		isSvelteKitProject =
			fs.existsSync(svelteConfigPath) || fs.existsSync(svelteConfigTsPath);
	}

	if (!isSvelteKitProject) {
		return aliases;
	}

	const libPaths = [path.join(cwd, "src", "lib"), path.join(cwd, "lib")];

	for (const libPath of libPaths) {
		if (fs.existsSync(libPath)) {
			aliases["$lib"] = libPath;
			// handles a common subpaths
			const commonSubPaths = ["server", "utils", "components", "stores"];
			for (const subPath of commonSubPaths) {
				const subDir = path.join(libPath, subPath);
				if (fs.existsSync(subDir)) {
					aliases[`$lib/${subPath}`] = subDir;
				}
			}
			break;
		}
	}
	// Add simple stub for $app/server to prevent CLI errors
	aliases["$app/server"] = createDataUriModule(createAppServerModule());

	const customAliases = getSvelteConfigAliases(cwd);
	Object.assign(aliases, customAliases);

	return aliases;
}
// for custom aliases in svelte.config.js/ts
function getSvelteConfigAliases(cwd: string): Record<string, string> {
	const aliases: Record<string, string> = {};
	const configPaths = [
		path.join(cwd, "svelte.config.js"),
		path.join(cwd, "svelte.config.ts"),
	];

	for (const configPath of configPaths) {
		if (fs.existsSync(configPath)) {
			try {
				const content = fs.readFileSync(configPath, "utf-8");
				const aliasMatch = content.match(/alias\s*:\s*\{([^}]+)\}/);
				if (aliasMatch && aliasMatch[1]) {
					const aliasContent = aliasMatch[1];
					const aliasMatches = aliasContent.matchAll(
						/['"`](\$[^'"`]+)['"`]\s*:\s*['"`]([^'"`]+)['"`]/g,
					);

					for (const match of aliasMatches) {
						const [, alias, target] = match;
						if (alias && target) {
							aliases[alias + "/*"] = path.resolve(cwd, target) + "/*";
							aliases[alias] = path.resolve(cwd, target);
						}
					}
				}
			} catch {
				// Ignore file reading/parsing errors
			}
			break;
		}
	}

	return aliases;
}

function createAppServerModule(): string {
	return `
// $app/server stub for CLI compatibility
export default {};
// jiti dirty hack: .unknown
`;
}

function createDataUriModule(module: string) {
	return `data:text/javascript;charset=utf-8,${encodeURIComponent(module)}`;
}

function createStaticEnvModule(env: Record<string, string>) {
	const declarations = Object.keys(env)
		.filter((k) => validIdentifier.test(k) && !reserved.has(k))
		.map((k) => `export const ${k} = ${JSON.stringify(env[k])};`);

	return `
  ${declarations.join("\n")}
  // jiti dirty hack: .unknown
  `;
}

function createDynamicEnvModule() {
	return `
  export const env = process.env;
  // jiti dirty hack: .unknown
  `;
}

function filterPrivateEnv(publicPrefix: string, privatePrefix: string) {
	return Object.fromEntries(
		Object.entries(process.env).filter(
			([k]) =>
				k.startsWith(privatePrefix) &&
				(publicPrefix === "" || !k.startsWith(publicPrefix)),
		),
	) as Record<string, string>;
}

function filterPublicEnv(publicPrefix: string, privatePrefix: string) {
	return Object.fromEntries(
		Object.entries(process.env).filter(
			([k]) =>
				k.startsWith(publicPrefix) &&
				(privatePrefix === "" || !k.startsWith(privatePrefix)),
		),
	) as Record<string, string>;
}

const validIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
const reserved = new Set([
	"do",
	"if",
	"in",
	"for",
	"let",
	"new",
	"try",
	"var",
	"case",
	"else",
	"enum",
	"eval",
	"null",
	"this",
	"true",
	"void",
	"with",
	"await",
	"break",
	"catch",
	"class",
	"const",
	"false",
	"super",
	"throw",
	"while",
	"yield",
	"delete",
	"export",
	"import",
	"public",
	"return",
	"static",
	"switch",
	"typeof",
	"default",
	"extends",
	"finally",
	"package",
	"private",
	"continue",
	"debugger",
	"function",
	"arguments",
	"interface",
	"protected",
	"implements",
	"instanceof",
]);
