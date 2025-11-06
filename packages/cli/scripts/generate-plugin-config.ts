import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Project, SyntaxKind } from "ts-morph";
import type { PrettifyDeep } from "../../better-auth/src/types/helper";
import type { GetArgumentsOptions } from "../src/commands/init/generate-auth";
import { formatCode } from "../src/commands/init/utility/format";

export type GetArgumentsOption = PrettifyDeep<
	Omit<GetArgumentsOptions, "argument" | "isNestedObject"> & {
		argument: {
			index: number;
			isProperty: false | string;
			schema?: string;
		};
		isNestedObject?: GetArgumentsOption[];
	}
>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pluginPath = (path: string) => `better-auth/src/plugins/${path}`;

/**
 * Mapping of plugin names to their type file locations
 */
const PLUGIN_TYPE_MAP: Record<
	string,
	{
		serverTypeFile: string;
		serverTypeName: string;
		clientTypeFile?: string;
		clientTypeName?: string;
		importPath?: string;
	}
> = {
	twoFactor: {
		serverTypeFile: pluginPath("two-factor/types.ts"),
		serverTypeName: "TwoFactorOptions",
		clientTypeFile: pluginPath("two-factor/client.ts"),
		clientTypeName: undefined,
	},
	username: {
		serverTypeFile: pluginPath("username/index.ts"),
		serverTypeName: "UsernameOptions",
		clientTypeFile: pluginPath("username/client.ts"),
		clientTypeName: undefined,
	},
	anonymous: {
		serverTypeFile: pluginPath("anonymous/index.ts"),
		serverTypeName: "AnonymousOptions",
		clientTypeFile: pluginPath("anonymous/client.ts"),
		clientTypeName: undefined,
	},
	phoneNumber: {
		serverTypeFile: pluginPath("phone-number/index.ts"),
		serverTypeName: "PhoneNumberOptions",
		clientTypeFile: pluginPath("phone-number/client.ts"),
		clientTypeName: undefined,
	},
};

const ROOT_DIR = path.resolve(__dirname, "../..");

export function toKebabCase(str: string): string {
	return str
		.replace(/([a-z])([A-Z])/g, "$1-$2")
		.replace(/\s+/g, "-")
		.toLowerCase();
}

export function toTitleCase(str: string): string {
	return str
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Extract JSDoc tags from a property node
 */
export function extractJSDocTags(jsDocNodes: any[]): {
	hasCliTag: boolean;
	shouldSkip: boolean;
	isRequired: boolean;
	isSelect: boolean;
	isMultiSelect: boolean;
	hasPrompt: boolean;
	defaultValue?: any;
	question?: string;
	description: string;
	selectOptions?: { value: string; label: string }[];
	type?: string;
	enumValues?: string[];
} {
	const allJsDocText = jsDocNodes.map((doc) => doc.getFullText()).join("\n");

	// Check for @cli tag
	const hasCliTag = /@cli\b/.test(allJsDocText);
	const shouldSkip = /@cli\s+skip/.test(allJsDocText);
	const isRequired = /@cli\s+required/.test(allJsDocText);
	const isMultiSelect = /@cli\s+multi-select/.test(allJsDocText);
	const hasPrompt = /@prompt\b/.test(allJsDocText);

	// Extract @cli select with optional custom options
	let isSelect = false;
	let selectOptions: { value: string; label: string }[] | undefined = undefined;
	// Match @cli select with optional options on the same line or next line
	const selectMatch = allJsDocText.match(/@cli\s+select(?:\s+([^\n@]+))?/);
	if (selectMatch) {
		isSelect = true;
		const optionsText = selectMatch[1]?.trim();
		if (optionsText) {
			// Parse custom options: "value1:Label1 value2:Label2" or "value1 value2"
			// Handle multiline by removing newlines and extra whitespace
			const normalizedText = optionsText.replace(/\s+/g, " ").trim();
			const optionParts = normalizedText
				.split(/\s+/)
				.filter((part) => part.length > 0);
			selectOptions = optionParts.map((part) => {
				const colonIndex = part.indexOf(":");
				if (colonIndex > 0) {
					// Format: "value:Label"
					const value = part.substring(0, colonIndex);
					const label = part.substring(colonIndex + 1);
					return { value, label };
				} else {
					// Format: "value" (use value as label, title-cased)
					return { value: part, label: toTitleCase(part) };
				}
			});
		}
	}

	// Extract @cli multi-select with optional custom options
	if (isMultiSelect && !selectOptions) {
		const multiSelectMatch = allJsDocText.match(
			/@cli\s+multi-select(?:\s+([^\n@]+))?/,
		);
		if (multiSelectMatch) {
			const optionsText = multiSelectMatch[1]?.trim();
			if (optionsText) {
				// Parse custom options: "value1:Label1 value2:Label2" or "value1 value2"
				const normalizedText = optionsText.replace(/\s+/g, " ").trim();
				const optionParts = normalizedText
					.split(/\s+/)
					.filter((part) => part.length > 0);
				selectOptions = optionParts.map((part) => {
					const colonIndex = part.indexOf(":");
					if (colonIndex > 0) {
						// Format: "value:Label"
						const value = part.substring(0, colonIndex);
						const label = part.substring(colonIndex + 1);
						return { value, label };
					} else {
						// Format: "value" (use value as label, title-cased)
						return { value: part, label: toTitleCase(part) };
					}
				});
			}
		}
	}

	// Extract @default value
	let defaultValue: any = undefined;
	const defaultMatch = allJsDocText.match(/@default\s+(.+?)(?:\n|$)/);
	if (defaultMatch) {
		let value = defaultMatch[1]!.trim();
		// Handle numeric defaults
		if (/^\d+$/.test(value)) {
			defaultValue = parseInt(value, 10);
		} else if (value === "true") {
			defaultValue = true;
		} else if (value === "false") {
			defaultValue = false;
		} else if (value.startsWith("{") && value.endsWith("}")) {
			// Try to parse as JSON object literal
			try {
				defaultValue = JSON.parse(value);
			} catch {
				// If parsing fails, store as string (will be escaped properly later)
				defaultValue = value.replace(/^["']|["']$/g, "");
			}
		} else {
			// Handle string defaults - remove quotes if present
			value = value.replace(/^["']|["']$/g, "");
			defaultValue = value;
		}
	}

	// Extract @question text
	let question: string | undefined = undefined;
	const questionMatch = allJsDocText.match(/@question\s+(.+?)(?:\n|$)/);
	if (questionMatch) {
		question = questionMatch[1]!.trim();
	}

	// Extract @type override
	let typeOverride: string | undefined = undefined;
	let enumValues: string[] | undefined = undefined;
	const typeMatch = allJsDocText.match(
		/@type\s+(\w+)(?:\s+([^\n@]+))?(?:\n|$)/,
	);
	if (typeMatch) {
		const typeValue = typeMatch[1]!.trim().toLowerCase();
		// Check for enum type with values
		if (typeValue === "enum") {
			const valuesText = typeMatch[2]?.trim();
			if (valuesText) {
				// Parse enum values: "value1 value2 value3"
				const normalizedText = valuesText.replace(/\s+/g, " ").trim();
				enumValues = normalizedText.split(/\s+/).filter((v) => v.length > 0);
				typeOverride = "enum";
			}
		} else {
			// Only allow primitive types
			const allowedTypes = ["string", "number", "boolean"];
			if (allowedTypes.includes(typeValue)) {
				typeOverride = typeValue;
			}
		}
	}

	// Extract description (everything before @ tags)
	// Remove JSDoc comment markers and tags
	const descriptionLines = allJsDocText
		.split("\n")
		.map((line) => line.trim())
		.map((line) => line.replace(/^\s*\*\s*/, "")) // Remove leading "* " or " * "
		.filter(
			(line) =>
				line.length > 0 &&
				!line.startsWith("@") &&
				line !== "*" &&
				line !== "/**" &&
				line !== "*/" &&
				line !== "/",
		);
	const description = descriptionLines.join(" ").trim();

	return {
		hasCliTag,
		shouldSkip,
		isRequired,
		isSelect,
		isMultiSelect,
		hasPrompt,
		defaultValue,
		question,
		description: description || "",
		selectOptions,
		type: typeOverride,
		enumValues,
	};
}

/**
 * Generate Zod schema from TypeScript type
 */
export function generateZodSchema(
	type: any,
	typeOverride?: string,
	enumValues?: string[],
): string {
	// If type override is provided, use it directly
	if (typeOverride) {
		let schema = "";

		// Handle enum type
		if (typeOverride === "enum" && enumValues && enumValues.length > 0) {
			schema = `z.enum([${enumValues.map((v) => `"${v}"`).join(", ")}])`;
		} else {
			switch (typeOverride) {
				case "string":
					schema = "z.coerce.string()";
					break;
				case "number":
					schema = "z.coerce.number()";
					break;
				case "boolean":
					schema = "z.coerce.boolean()";
					break;
				default:
					schema = "z.coerce.string()";
			}
		}

		// Check if the original type is optional
		const typeText = type.getText();
		const isOptional = type.isNullable() || type.isUndefined();
		if (isOptional && !typeText.includes("required")) {
			schema += ".optional()";
		}

		return schema;
	}

	const typeText = type.getText();
	const isOptional = type.isNullable() || type.isUndefined();

	let schema = "";

	// Check for union types (enums)
	if (type.isUnion()) {
		const unionTypes = type.getUnionTypes();
		const stringLiterals = unionTypes
			.map((t: any) => {
				const text = t.getText();
				if (text.startsWith('"') && text.endsWith('"')) {
					return text.slice(1, -1);
				}
				return null;
			})
			.filter((v: string | null): v is string => v !== null);

		if (
			stringLiterals.length > 0 &&
			stringLiterals.length === unionTypes.length
		) {
			schema = `z.enum([${stringLiterals.map((v: string) => `"${v}"`).join(", ")}])`;
		} else {
			schema = "z.coerce.string()";
		}
	} else if (
		typeText.includes("string") ||
		type.getSymbol()?.getName() === "String"
	) {
		schema = "z.coerce.string()";
	} else if (
		typeText.includes("number") ||
		type.getSymbol()?.getName() === "Number"
	) {
		schema = "z.coerce.number()";
	} else if (
		typeText.includes("boolean") ||
		type.getSymbol()?.getName() === "Boolean"
	) {
		schema = "z.coerce.boolean()";
	} else {
		schema = "z.coerce.string()";
	}

	if (isOptional && !typeText.includes("required")) {
		schema += ".optional()";
	}

	return schema;
}

/**
 * Generate question text based on property name and type
 */
export function generateQuestion(
	propertyName: string,
	type: any,
	typeOverride: string | undefined,
	pluginName: string,
): string {
	const formattedName = propertyName.replace(/([A-Z])/g, " $1").toLowerCase();
	const pluginDisplayName = toTitleCase(pluginName);

	// Determine the actual type to use
	const actualType =
		typeOverride ||
		(type.getText().includes("boolean") ||
		type.getSymbol()?.getName() === "Boolean"
			? "boolean"
			: type.getText().includes("number") ||
					type.getSymbol()?.getName() === "Number"
				? "number"
				: "string");

	// Generate question based on type
	let baseQuestion: string;
	switch (actualType) {
		case "boolean":
			baseQuestion = `Would you like to ${formattedName}?`;
			break;
		case "number":
			baseQuestion = `What is the ${formattedName}?`;
			break;
		default:
			baseQuestion = `What is the ${formattedName}?`;
	}

	return `[${pluginDisplayName}] ${baseQuestion}`;
}

/**
 * Process a property node and extract CLI config if it has @cli tag
 */
function processProperty(
	property: any,
	pluginName: string,
	prefix: string,
	project: Project,
	depth: number = 0,
): GetArgumentsOption | null {
	if (depth > 3) return null;

	const symbol = property.getSymbol();
	if (!symbol) return null;

	const propertyName = symbol.getName();
	const jsDocNodes = property.getJsDocs();

	// Extract JSDoc tags
	const tags = extractJSDocTags(jsDocNodes);

	// Skip if no @cli tag or explicitly skipped
	if (!tags.hasCliTag || tags.shouldSkip) {
		return null;
	}

	const type = symbol.getTypeAtLocation(property);
	const typeText = type.getText();

	// Generate flag name
	const flag = prefix
		? `${toKebabCase(pluginName)}-${toKebabCase(prefix)}-${toKebabCase(propertyName)}`
		: `${toKebabCase(pluginName)}-${toKebabCase(propertyName)}`;

	// Generate question - use custom question or generate based on type
	const question = tags.question
		? `[${toTitleCase(pluginName)}] ${tags.question}`
		: generateQuestion(propertyName, type, tags.type, pluginName);

	// Check if this is a nested type reference
	let nestedOptions: GetArgumentsOption[] | undefined = undefined;

	// Extract type name from the type text (handles Omit<>, direct types, etc.)
	let typeNameToFind: string | undefined = undefined;
	let omittedProperties: string[] = [];
	const typeSymbol = type.getSymbol();

	// Handle Omit<> utility type - extract the base type name
	if (typeText.includes("Omit<")) {
		const omitMatch = typeText.match(/Omit<([^,]+),/);
		if (omitMatch && omitMatch[1]) {
			typeNameToFind = omitMatch[1].trim();
			// Extract omitted properties
			const omitPropsMatch = typeText.match(
				/Omit<[^,]+,\s*"([^"]+)"|\["([^"]+)"\]/,
			);
			if (omitPropsMatch) {
				omittedProperties.push(omitPropsMatch[1] || omitPropsMatch[2] || "");
			}
		}
	} else if (typeText.includes("Options") || typeText.includes("Config")) {
		// Try to extract type name from the text (e.g., "OTPOptions | undefined" -> "OTPOptions")
		const typeMatch = typeText.match(/(\w+Options|\w+Config)/);
		if (typeMatch) {
			typeNameToFind = typeMatch[1];
		}
	}

	// Try to find the type definition across all files
	if (typeNameToFind) {
		const allFiles = project.getSourceFiles();
		for (const file of allFiles) {
			const foundType =
				file
					.getTypeAliases()
					.find((t: any) => t.getName() === typeNameToFind) ||
				file.getInterfaces().find((i: any) => i.getName() === typeNameToFind);

			if (foundType) {
				const resolvedType = foundType.getType();
				const properties = resolvedType.getProperties();

				// Process nested properties that have @cli tag
				nestedOptions = properties
					.map((prop: any) => {
						const propDeclarations = prop.getDeclarations();
						if (propDeclarations.length === 0) return null;
						const propName = prop.getName();
						// Skip omitted properties
						if (omittedProperties.includes(propName)) {
							return null;
						}
						return processProperty(
							propDeclarations[0],
							pluginName,
							propertyName,
							project,
							depth + 1,
						);
					})
					.filter(
						(opt: GetArgumentsOption | null): opt is GetArgumentsOption =>
							opt !== null,
					);

				if (nestedOptions && nestedOptions.length > 0) {
					break;
				}
			}
		}
	}

	// Fallback: try to resolve from type symbol declarations
	if (!nestedOptions || nestedOptions.length === 0) {
		const isTypeReference =
			typeSymbol &&
			(typeSymbol
				.getDeclarations()
				.some((d: any) =>
					[
						SyntaxKind.TypeAliasDeclaration,
						SyntaxKind.InterfaceDeclaration,
					].includes(d.getKind()),
				) ||
				typeText.includes("Options") ||
				typeText.includes("Config"));

		if (isTypeReference && typeSymbol) {
			const declarations = typeSymbol.getDeclarations();
			for (const decl of declarations) {
				if (
					decl.getKind() === SyntaxKind.TypeAliasDeclaration ||
					decl.getKind() === SyntaxKind.InterfaceDeclaration
				) {
					const resolvedType = decl.getType();
					const properties = resolvedType.getProperties();

					// Process nested properties that have @cli tag
					nestedOptions = properties
						.map((prop: any) => {
							const propDeclarations = prop.getDeclarations();
							if (propDeclarations.length === 0) return null;
							const propName = prop.getName();
							// Skip omitted properties if this is an Omit<> type
							if (omittedProperties.includes(propName)) {
								return null;
							}
							return processProperty(
								propDeclarations[0],
								pluginName,
								propertyName,
								project,
								depth + 1,
							);
						})
						.filter(
							(opt: GetArgumentsOption | null): opt is GetArgumentsOption =>
								opt !== null,
						);

					if (nestedOptions && nestedOptions.length > 0) {
						break;
					}
				}
			}
		}
	}

	// Handle inline object types (object type literals)
	// Check if this is an object type with properties (not a named type reference)
	if (!nestedOptions || nestedOptions.length === 0) {
		// Check if the type is an object type
		// For union types with undefined, get the non-undefined member
		let typeToCheck = type;
		if (type.isUnion()) {
			const unionTypes = type.getUnionTypes();
			const nonUndefinedType = unionTypes.find((t: any) => !t.isUndefined());
			if (nonUndefinedType) {
				typeToCheck = nonUndefinedType;
			}
		}

		// Check if this type has properties directly (object type literal)
		const properties = typeToCheck.getProperties();
		if (properties.length > 0) {
			// Check if this is likely an inline object type
			// Inline object types either:
			// 1. Don't have a typeSymbol with declarations, OR
			// 2. Have a typeSymbol but it's not a TypeAlias or Interface
			const isInlineObjectType =
				!typeSymbol ||
				!typeSymbol
					.getDeclarations()
					.some((d: any) =>
						[
							SyntaxKind.TypeAliasDeclaration,
							SyntaxKind.InterfaceDeclaration,
						].includes(d.getKind()),
					);

			if (isInlineObjectType) {
				// This is likely an inline object type
				// Process nested properties that have @cli tag
				nestedOptions = properties
					.map((prop: any) => {
						const propDeclarations = prop.getDeclarations();
						if (propDeclarations.length === 0) return null;
						const propName = prop.getName();
						// Skip omitted properties if this is an Omit<> type
						if (omittedProperties.includes(propName)) {
							return null;
						}
						return processProperty(
							propDeclarations[0],
							pluginName,
							propertyName,
							project,
							depth + 1,
						);
					})
					.filter(
						(opt: GetArgumentsOption | null): opt is GetArgumentsOption =>
							opt !== null,
					);
			}
		}
	}

	// Generate schema only if there are no nested objects
	// Nested objects don't need schemas as they're structured objects, not primitive values
	const schema =
		nestedOptions && nestedOptions.length > 0
			? undefined
			: generateZodSchema(type, tags.type, tags.enumValues);

	// Check if this is a select/enum type
	let isSelectOptions: { value: any; label?: string }[] | undefined = undefined;
	let isMultiselectOptions: { value: any; label?: string }[] | undefined =
		undefined;

	// Use custom select options if provided in JSDoc
	if (tags.selectOptions && tags.selectOptions.length > 0) {
		const options = tags.selectOptions;
		if (tags.isMultiSelect) {
			isMultiselectOptions = options;
		} else {
			isSelectOptions = options;
		}
	} else if (tags.isSelect || tags.isMultiSelect) {
		// Otherwise, try to extract from union type
		if (type.isUnion()) {
			const unionTypes = type.getUnionTypes();
			const stringLiterals = unionTypes
				.map((t: any) => {
					// Check if this is a string literal type using multiple methods
					try {
						// Method 1: Check if it's a string literal type directly
						const isStringLiteralType =
							t.isStringLiteral() ||
							(t.getFlags && (t.getFlags() & 256) === 256); // StringLiteral flag

						if (!isStringLiteralType) {
							return null;
						}

						// Try to get the text representation of the type
						const text = t.getText();

						// Only extract string literal types (wrapped in quotes)
						if (
							typeof text === "string" &&
							text.startsWith('"') &&
							text.endsWith('"') &&
							text.length > 2
						) {
							const value = text.slice(1, -1);
							// Additional validation: ensure the extracted value is valid
							// Filter out single characters that are likely JSDoc markers or invalid
							// Filter out values containing asterisks or slashes (JSDoc markers)
							if (
								value.length > 0 &&
								value !== "*" &&
								value !== "/" &&
								!value.includes("*") &&
								!value.includes("/") &&
								!value.trim().startsWith("*") &&
								!value.trim().startsWith("/")
							) {
								return value;
							}
						}
					} catch {
						// If any error occurs, skip this type
						return null;
					}

					return null;
				})
				.filter((v: string | null): v is string => v !== null && v.length > 0);

			// If we found string literals, use them (don't require all union types to be literals)
			if (stringLiterals.length > 0) {
				const options = stringLiterals.map((v: string) => ({
					value: v,
					label: toTitleCase(v),
				}));
				if (tags.isMultiSelect) {
					isMultiselectOptions = options;
				} else {
					isSelectOptions = options;
				}
			}
		}
	}

	const option: GetArgumentsOption = {
		flag,
		description: tags.description || propertyName,
		question,
		skipPrompt: !tags.hasPrompt, // Default: skip prompt unless @prompt tag is present
		argument: {
			index: 0,
			isProperty: propertyName,
			...(schema !== undefined && { schema }),
		},
	};

	// Only set defaultValue if this is NOT a nested object
	// Nested objects should have their defaults set on individual properties, not the parent
	if (
		tags.defaultValue !== undefined &&
		(!nestedOptions || nestedOptions.length === 0)
	) {
		option.defaultValue = tags.defaultValue;
	}

	if (isSelectOptions) {
		option.isSelectOptions = isSelectOptions;
	}

	if (isMultiselectOptions) {
		option.isMultiselectOptions = isMultiselectOptions;
	}

	if (nestedOptions && nestedOptions.length > 0) {
		option.isNestedObject = nestedOptions;
	}

	// Check if it's a number type
	if (schema && schema.includes("number")) {
		option.isNumber = true;
	}

	return option;
}

/**
 * Generate plugin config from type definition
 */
export function generatePluginConfig(
	pluginName: string,
	pluginInfo: (typeof PLUGIN_TYPE_MAP)[string],
	project: Project,
): {
	pluginConfig: GetArgumentsOption[];
	displayName: string;
	importPath: string;
	functionName: string;
	hasClient: boolean;
} {
	const displayName = toTitleCase(pluginName);

	// Load server type file
	const serverTypeFile = project.addSourceFileAtPath(
		path.resolve(ROOT_DIR, pluginInfo.serverTypeFile),
	);

	// Find the type - try interface first, then type alias
	let typeNode:
		| ReturnType<typeof serverTypeFile.getInterfaces>[number]
		| ReturnType<typeof serverTypeFile.getTypeAliases>[number]
		| undefined;

	const interfaceNode = serverTypeFile
		.getInterfaces()
		.find((iface) => iface.getName() === pluginInfo.serverTypeName);
	if (interfaceNode) {
		typeNode = interfaceNode;
	} else {
		typeNode = serverTypeFile
			.getTypeAliases()
			.find((alias) => alias.getName() === pluginInfo.serverTypeName);
	}

	if (!typeNode) {
		throw new Error(
			`Could not find type ${pluginInfo.serverTypeName} in ${pluginInfo.serverTypeFile}`,
		);
	}

	const serverType = typeNode.getType();

	// Process properties - only those with @cli tag
	const properties = serverType.getProperties();
	const argumentsList: GetArgumentsOption[] = properties
		.map((prop) => {
			const declarations = prop.getDeclarations();
			if (declarations.length === 0) return null;
			return processProperty(declarations[0], pluginName, "", project, 0);
		})
		.filter((opt): opt is GetArgumentsOption => opt !== null);

	// Generate import path
	const importPath = pluginInfo.importPath || "better-auth/plugins";
	const functionName = pluginName;

	return {
		pluginConfig: argumentsList,
		displayName,
		importPath,
		functionName,
		hasClient: !!pluginInfo.clientTypeFile,
	};
}

/**
 * Generate individual plugin file code
 */
export function generateIndividualPluginFile(
	pluginName: string,
	pluginData: ReturnType<typeof generatePluginConfig>,
): string {
	const argumentsCode =
		pluginData.pluginConfig.length > 0
			? `arguments: [\n${pluginData.pluginConfig
					.map((arg) => generateArgumentCode(arg))
					.join(",\n")}\n\t\t],`
			: "";

	const authClientCode = pluginData.hasClient
		? `{
		function: "${pluginData.functionName}Client",
		imports: [
			{
				path: "better-auth/client/plugins",
				imports: [createImport({ name: "${pluginData.functionName}Client" })],
				isNamedImport: false,
			},
		],
}`
		: "null";

	return `import * as z from "zod/v4";
import { createImport } from "../utility/imports";
import type { PluginConfig } from "./plugins-index.config";

// This file is automatically generated during build by a script called 'generate-plugin-config.ts'
// Read more about the script at /packages/cli/scripts/README.md

export const ${pluginName}PluginConfig = {
	displayName: "${pluginData.displayName}",
	auth: {
		function: "${pluginData.functionName}",
		imports: [
			{
				path: "${pluginData.importPath}",
				imports: [createImport({ name: "${pluginData.functionName}" })],
				isNamedImport: false,
			},
		],
		${argumentsCode}
	},
	authClient: ${authClientCode},
} as const satisfies PluginConfig;`;
}

/**
 * Generate index file that combines all plugins
 */
export function generateIndexFile(pluginNames: string[]): string {
	const imports = pluginNames
		.map(
			(name) =>
				`import { ${name}PluginConfig } from "./plugin-${toKebabCase(name)}.config";`,
		)
		.join("\n");

	const exports = pluginNames
		.map((name) => `\t${name}: ${name}PluginConfig,`)
		.join("\n");

	return `import type { GetArgumentsOptions } from "../generate-auth";
import { type ImportGroup } from "../utility/imports";
${imports}

export type Plugin = keyof typeof pluginsConfig;

export type PluginConfig = {
	displayName: string;
	auth: {
		function: string;
		imports: ImportGroup[];
		arguments?: GetArgumentsOptions[];
	};
	authClient: {
		function: string;
		imports: ImportGroup[];
		arguments?: GetArgumentsOptions[];
	} | null;
};

export type PluginsConfig = {
	[key in Plugin]: PluginConfig;
};

export const pluginsConfig = {
${exports}
} as const satisfies Record<string, PluginConfig>;
`;
}

/**
 * Generate code for a single argument option
 */
export function generateArgumentCode(
	arg: GetArgumentsOption,
	indent = "\t\t\t\t",
): string {
	const parts: string[] = [`${indent}{`];

	parts.push(`${indent}\tflag: "${arg.flag}",`);
	if (arg.description) {
		parts.push(`${indent}\tdescription: "${arg.description}",`);
	}
	if (arg.question) {
		parts.push(`${indent}\tquestion: "${arg.question}",`);
	}
	// Skip defaultValue if this is a nested object (nested objects use defaults on child properties)
	if (
		arg.defaultValue !== undefined &&
		(!arg.isNestedObject || arg.isNestedObject.length === 0)
	) {
		let defaultValueStr: string;
		if (typeof arg.defaultValue === "string") {
			// Check if it looks like an object literal (starts with { and ends with })
			if (
				arg.defaultValue.trim().startsWith("{") &&
				arg.defaultValue.trim().endsWith("}")
			) {
				// Try to parse it as JSON to validate, then stringify it properly
				try {
					const parsed = JSON.parse(arg.defaultValue);
					defaultValueStr = JSON.stringify(parsed);
				} catch {
					// If parsing fails, use JSON.stringify to escape quotes properly
					defaultValueStr = JSON.stringify(arg.defaultValue);
				}
			} else if (arg.defaultValue === "true" || arg.defaultValue === "false") {
				defaultValueStr = arg.defaultValue;
			} else if (/^\d+$/.test(arg.defaultValue)) {
				defaultValueStr = arg.defaultValue;
			} else {
				// For regular strings, use JSON.stringify to properly escape quotes
				defaultValueStr = JSON.stringify(arg.defaultValue);
			}
		} else {
			defaultValueStr = JSON.stringify(arg.defaultValue);
		}
		parts.push(`${indent}\tdefaultValue: ${defaultValueStr},`);
	}
	if (arg.skipPrompt !== undefined) {
		parts.push(`${indent}\tskipPrompt: ${arg.skipPrompt},`);
	}
	if (arg.isNumber) {
		parts.push(`${indent}\tisNumber: true,`);
	}
	if (arg.isSelectOptions) {
		parts.push(
			`${indent}\tisSelectOptions: [\n${arg.isSelectOptions
				.map(
					(opt) =>
						`${indent}\t\t{ value: "${opt.value}", label: "${opt.label || toTitleCase(opt.value)}" }`,
				)
				.join(",\n")}\n${indent}\t],`,
		);
	}
	if (arg.isMultiselectOptions) {
		parts.push(
			`${indent}\tisMultiselectOptions: [\n${arg.isMultiselectOptions
				.map(
					(opt) =>
						`${indent}\t\t{ value: "${opt.value}", label: "${opt.label || toTitleCase(opt.value)}" }`,
				)
				.join(",\n")}\n${indent}\t],`,
		);
	}
	if (arg.isNestedObject && arg.isNestedObject.length > 0) {
		parts.push(
			`${indent}\tisNestedObject: [\n${arg.isNestedObject
				.map((nested) => generateArgumentCode(nested, indent + "\t"))
				.join(",\n")}\n${indent}\t],`,
		);
	}

	parts.push(`${indent}\targument: {`);
	parts.push(`${indent}\t\tindex: ${arg.argument.index},`);
	parts.push(
		`${indent}\t\tisProperty: ${arg.argument.isProperty ? `"${arg.argument.isProperty}"` : "false"},`,
	);
	if (arg.argument.schema) {
		parts.push(`${indent}\t\tschema: ${arg.argument.schema},`);
	}
	parts.push(`${indent}\t},`);

	parts.push(`${indent}}`);
	return parts.join("\n");
}

async function main() {
	console.log("Generating plugin configs...");

	const project = new Project({
		tsConfigFilePath: path.resolve(ROOT_DIR, "better-auth/tsconfig.json"),
	});

	const pluginNames: string[] = [];

	for (const [pluginName, pluginInfo] of Object.entries(PLUGIN_TYPE_MAP)) {
		try {
			console.log(`Processing ${pluginName}...`);
			const pluginData = generatePluginConfig(pluginName, pluginInfo, project);
			const pluginFileContent = generateIndividualPluginFile(
				pluginName,
				pluginData,
			);

			const formattedPluginFile = await formatCode(pluginFileContent);
			const pluginFileName = `plugin-${toKebabCase(pluginName)}.config.ts`;
			const pluginFilePath = path.resolve(
				ROOT_DIR,
				"cli/src/commands/init/configs",
				pluginFileName,
			);

			fs.writeFileSync(pluginFilePath, formattedPluginFile);
			console.log(`Generated ${pluginFileName}`);
			pluginNames.push(pluginName);
		} catch (error) {
			console.error(`Error processing ${pluginName}:`, error);
		}
	}

	// Generate index file
	if (pluginNames.length > 0) {
		console.log("Generating plugins-index.config.ts...");
		const indexFileContent = generateIndexFile(pluginNames);
		const formattedIndexFile = await formatCode(indexFileContent);
		const indexFilePath = path.resolve(
			ROOT_DIR,
			"cli/src/commands/init/configs",
			"plugins-index.config.ts",
		);

		fs.writeFileSync(indexFilePath, formattedIndexFile);
		console.log(`Generated plugins-index.config.ts`);
		console.log(
			`\nGenerated ${pluginNames.length} plugin config files and index file.`,
		);
	}
}

main().catch(console.error);
