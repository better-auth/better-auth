export function addSvelteKitEnvModules(aliases: Record<string, string>) {
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

export function filterPrivateEnv(publicPrefix: string, privatePrefix: string) {
	return Object.fromEntries(
		Object.entries(process.env).filter(
			([k]) =>
				k.startsWith(privatePrefix) &&
				(publicPrefix === "" || !k.startsWith(publicPrefix)),
		),
	) as Record<string, string>;
}

export function filterPublicEnv(publicPrefix: string, privatePrefix: string) {
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
