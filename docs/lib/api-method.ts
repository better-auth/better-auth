export const apiMethodHttpMethods = [
	"GET",
	"POST",
	"PUT",
	"PATCH",
	"DELETE",
] as const;

export type ApiMethodHttpMethod = (typeof apiMethodHttpMethods)[number];

export interface ApiMethodOptions {
	path: string;
	method?: ApiMethodHttpMethod;
	isServerOnly?: boolean;
	isClientOnly?: boolean;
	isExternalOnly?: boolean;
	noResult?: boolean;
	requireSession?: boolean;
	requireHeaders?: boolean;
	requireBearerToken?: boolean;
	headersComment?: string;
	note?: string;
	clientOnlyNote?: string;
	serverOnlyNote?: string;
	resultVariable?: string;
	forceAsBody?: boolean;
	forceAsParam?: boolean;
	forceAsQuery?: boolean;
}

export interface ApiMethodProperty {
	optional: boolean;
	description: string | null;
	name: string;
	type: string;
	exampleValue: string | null;
	serverOnly: boolean;
	path: string[];
	nullable: boolean;
	clientOnly: boolean;
}

export interface ParsedApiMethod {
	functionName: string;
	properties: ApiMethodProperty[];
	codePrefix: string;
	codeSuffix: string;
	typeDefinition: string;
}

const indentation = "    ";
const typeDeclarationPattern = /^type\s+([A-Za-z_$][\w$]*)\s*=\s*\{$/;
const propertyPattern = /^([A-Za-z_$][\w$]*)(\?)?:\s*(.+)$/;

function parsePropertyLine(line: string) {
	const match = propertyPattern.exec(line);
	if (!match) return null;

	const [, name, optional, declaration] = match;
	const exampleSeparator = declaration.indexOf(" = ");
	const type = (
		exampleSeparator === -1
			? declaration
			: declaration.slice(0, exampleSeparator)
	)
		.trim()
		.replace(/[;,]$/, "");
	const exampleValue =
		exampleSeparator === -1
			? null
			: declaration
					.slice(exampleSeparator + 3)
					.trim()
					.replace(/[;,]$/, "");

	return {
		name,
		optional: optional === "?",
		type,
		exampleValue,
	};
}

function readDirective(value: string, directive: string): string | null {
	if (value !== directive && !value.startsWith(`${directive} `)) return null;
	return value
		.slice(directive.length)
		.replace(/^\s*-\s*/, "")
		.trim();
}

function isPathRestricted(restrictedPaths: Set<string>, path: string[]) {
	for (let length = 1; length <= path.length; length++) {
		if (restrictedPaths.has(path.slice(0, length).join("."))) return true;
	}
	return false;
}

export function parseApiMethod(source: string): ParsedApiMethod {
	const lines = source.replaceAll("\r\n", "\n").trim().split("\n");
	const properties: ApiMethodProperty[] = [];
	const nestedPath: string[] = [];
	const serverOnlyPaths = new Set<string>();
	const clientOnlyPaths = new Set<string>();
	let functionName = "";
	let typeStart = -1;
	let typeEnd = -1;
	let description = "";
	let serverOnly = false;
	let clientOnly = false;
	let nullable = false;

	for (const [index, originalLine] of lines.entries()) {
		const line = originalLine.trim();

		if (typeStart === -1) {
			const declaration = typeDeclarationPattern.exec(line);
			if (!declaration) continue;
			functionName = declaration[1];
			typeStart = index;
			continue;
		}

		if (/^}[,;]?$/.test(line)) {
			if (nestedPath.length > 0) {
				nestedPath.pop();
				continue;
			}
			typeEnd = index;
			break;
		}

		if (line.startsWith("/*") || line.startsWith("*/")) continue;
		if (line.startsWith("*")) {
			const value = line.slice(1).trim();
			if (!value) continue;
			const serverOnlyDescription = readDirective(value, "@serverOnly");
			if (serverOnlyDescription !== null) {
				serverOnly = true;
				if (serverOnlyDescription) {
					description += `${serverOnlyDescription} `;
				}
				continue;
			}
			const clientOnlyDescription = readDirective(value, "@clientOnly");
			if (clientOnlyDescription !== null) {
				clientOnly = true;
				if (clientOnlyDescription) {
					description += `${clientOnlyDescription} `;
				}
				continue;
			}
			const nullableDescription = readDirective(value, "@nullable");
			if (nullableDescription !== null) {
				nullable = true;
				if (nullableDescription) description += `${nullableDescription} `;
				continue;
			}
			description += `${value} `;
			continue;
		}

		if (!line) continue;
		const parsed = parsePropertyLine(line);
		if (!parsed) continue;

		const propertyPath = nestedPath.slice();
		const nested = parsed.type === "{";
		if (nested) {
			nestedPath.push(parsed.name);
			if (serverOnly) serverOnlyPaths.add(nestedPath.join("."));
			if (clientOnly) clientOnlyPaths.add(nestedPath.join("."));
		}

		properties.push({
			name: parsed.name,
			optional: parsed.optional,
			type: nested ? "Object" : parsed.type,
			exampleValue: parsed.exampleValue,
			description: description.trim() || null,
			serverOnly: serverOnly || isPathRestricted(serverOnlyPaths, nestedPath),
			clientOnly: clientOnly || isPathRestricted(clientOnlyPaths, nestedPath),
			path: propertyPath,
			nullable,
		});

		description = "";
		serverOnly = false;
		clientOnly = false;
		nullable = false;
	}

	if (typeStart === -1 || typeEnd === -1) {
		return {
			functionName: "",
			properties: [],
			codePrefix: "",
			codeSuffix: "",
			typeDefinition: source.trim(),
		};
	}

	const prefix = lines.slice(0, typeStart).join("\n").trim();
	const suffix = lines
		.slice(typeEnd + 1)
		.join("\n")
		.trim();

	return {
		functionName,
		properties,
		codePrefix: prefix ? `${prefix}\n` : "",
		codeSuffix: suffix ? `\n${suffix}` : "",
		typeDefinition: lines.slice(typeStart, typeEnd + 1).join("\n"),
	};
}

function pathToMethodName(path: string): string {
	return path
		.split("/")
		.filter((segment) => segment.length > 0)
		.map((segment) =>
			segment
				.split("-")
				.map((word, index) =>
					index === 0
						? word.toLowerCase()
						: word.charAt(0).toUpperCase() + word.slice(1),
				)
				.join(""),
		)
		.join(".");
}

function buildPropertyLine(
	property: ApiMethodProperty,
	indentLevel: number,
	additionalComments: string[] = [],
): string {
	const comments = [...additionalComments];
	if (!property.optional) comments.push("required");
	if (property.description) comments.push(property.description);

	const indent = indentation.repeat(indentLevel);
	const value = property.exampleValue ? `: ${property.exampleValue}` : "";
	const comment = comments.length > 0 ? ` // ${comments.join(", ")}` : "";

	return property.type === "Object"
		? `${indent}${property.name}${value}: {${comment}\n`
		: `${indent}${property.name}${value},${comment}\n`;
}

function usesQuery(
	method: ApiMethodHttpMethod,
	options: Pick<
		ApiMethodOptions,
		"forceAsBody" | "forceAsParam" | "forceAsQuery"
	>,
): boolean {
	if (options.forceAsQuery) return true;
	if (options.forceAsBody || options.forceAsParam) return false;
	return method === "GET";
}

function closeNestedProperties(
	properties: ApiMethodProperty[],
	index: number,
	baseIndentLevel: number,
): string {
	const property = properties[index];
	const currentDepth =
		property.path.length + (property.type === "Object" ? 1 : 0);
	const nextDepth = properties[index + 1]?.path.length ?? 0;
	if (nextDepth >= currentDepth) return "";

	let result = "";
	for (let depth = currentDepth - 1; depth >= nextDepth; depth--) {
		result += `${indentation.repeat(depth + baseIndentLevel)}},\n`;
	}
	return result;
}

function createClientBody(
	properties: ApiMethodProperty[],
	method: ApiMethodHttpMethod,
	options: ApiMethodOptions,
): string {
	const query = usesQuery(method, options);
	const baseIndentLevel = query ? 2 : 1;
	const clientProperties = properties.filter(
		(property) => !property.serverOnly,
	);
	let propertiesContent = "";

	for (const [index, property] of clientProperties.entries()) {
		if (!propertiesContent) propertiesContent = "{\n";
		propertiesContent += buildPropertyLine(
			property,
			property.path.length + baseIndentLevel,
		);
		propertiesContent += closeNestedProperties(
			clientProperties,
			index,
			baseIndentLevel,
		);
	}

	if (!propertiesContent) return "";
	if (query) return `{\n    query: ${propertiesContent}    },\n}`;
	return `${propertiesContent}}`;
}

function createServerBody(
	properties: ApiMethodProperty[],
	method: ApiMethodHttpMethod,
	options: ApiMethodOptions,
): string {
	const query = usesQuery(method, options);
	const serverProperties = properties.filter(
		(property) => !property.clientOnly,
	);
	let propertiesContent = "";

	for (const [index, property] of serverProperties.entries()) {
		if (!propertiesContent) propertiesContent = "{\n";

		const parentPath = property.path.slice(0, -1).join(".");
		const inheritedServerOnly =
			property.serverOnly &&
			!properties.some(
				(candidate) =>
					candidate.path.join(".") === parentPath &&
					candidate.name === property.path.at(-1),
			);
		propertiesContent += buildPropertyLine(
			property,
			property.path.length + 2,
			inheritedServerOnly ? ["server-only"] : [],
		);
		propertiesContent += closeNestedProperties(serverProperties, index, 2);
	}

	if (propertiesContent) propertiesContent += "    },";

	let headers = "";
	const requestHeadersRequired =
		options.requireSession || options.requireHeaders;
	if (options.requireSession) {
		headers += "\n    // This endpoint requires session cookies.";
	} else if (options.requireHeaders) {
		headers += `\n    // ${
			options.headersComment ??
			"Pass the current request headers so Better Auth can read and set cookies."
		}`;
	}
	if (options.requireBearerToken) {
		headers += "\n    // This endpoint requires a bearer authentication token.";
	}
	if (requestHeadersRequired && options.requireBearerToken) {
		headers +=
			"\n    headers: {\n        ...(await headers()),\n        authorization: 'Bearer <token>',\n    },";
	} else if (requestHeadersRequired) {
		headers += "\n    headers: await headers(),";
	} else if (options.requireBearerToken) {
		headers += "\n    headers: { authorization: 'Bearer <token>' },";
	}

	if (serverProperties.length > 0) {
		const parameter = query
			? "query"
			: options.forceAsParam
				? "params"
				: "body";
		return `{\n    ${parameter}: ${propertiesContent}${headers}\n}`;
	}
	return headers ? `{${headers}\n}` : "";
}

export function generateApiMethodExamples(
	definition: ParsedApiMethod,
	options: ApiMethodOptions,
) {
	const method = options.method ?? "GET";
	const resultVariable = options.resultVariable ?? "data";
	const clientResult = options.noResult
		? ""
		: `const { data${resultVariable === "data" ? "" : `: ${resultVariable}`}, error } = `;
	const serverResult = options.noResult ? "" : `const ${resultVariable} = `;

	return {
		client: `${definition.codePrefix}${clientResult}await authClient.${pathToMethodName(options.path)}(${createClientBody(definition.properties, method, options)});${definition.codeSuffix}`,
		server: `${definition.codePrefix}${serverResult}await auth.api.${definition.functionName}(${createServerBody(definition.properties, method, options)});${definition.codeSuffix}`,
	};
}
