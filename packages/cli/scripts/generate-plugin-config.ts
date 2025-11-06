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
 *
 * # THIS IS THE CORE OF WHERE PLUGINS ARE AUTOMATICALLY GENERATED
 *
 * Please update this list if plugins are added moved, or removed.
 */
const PLUGIN_TYPE_MAP: Record<
	string,
	{
		serverTypeFile: string;
		serverTypeName: string;
		clientTypeFile?: string;
		clientTypeName?: string;
		importPath?: string;
		clientImportPath?: string;
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
	magicLink: {
		serverTypeFile: pluginPath("magic-link/index.ts"),
		serverTypeName: "MagicLinkopts",
		clientTypeFile: pluginPath("magic-link/client.ts"),
		clientTypeName: undefined,
	},
	emailOTP: {
		serverTypeFile: pluginPath("email-otp/index.ts"),
		serverTypeName: "EmailOTPOptions",
		clientTypeFile: pluginPath("email-otp/client.ts"),
		clientTypeName: undefined,
	},
	passkey: {
		serverTypeFile: "passkey/src/types.ts",
		serverTypeName: "PasskeyOptions",
		clientTypeFile: "passkey/src/client.ts",
		clientTypeName: undefined,
		importPath: "@better-auth/passkey",
		clientImportPath: "@better-auth/passkey/client",
	},
	genericOAuth: {
		serverTypeFile: pluginPath("generic-oauth/index.ts"),
		serverTypeName: "GenericOAuthOptions",
		clientTypeFile: pluginPath("generic-oauth/client.ts"),
		clientTypeName: undefined,
	},
	oneTap: {
		serverTypeFile: pluginPath("one-tap/index.ts"),
		serverTypeName: "OneTapOptions",
		clientTypeFile: pluginPath("one-tap/client.ts"),
		clientTypeName: "GoogleOneTapOptions",
	},
	siwe: {
		serverTypeFile: pluginPath("siwe/index.ts"),
		serverTypeName: "SIWEPluginOptions",
		clientTypeFile: pluginPath("siwe/client.ts"),
		clientTypeName: undefined,
	},
	admin: {
		serverTypeFile: pluginPath("admin/types.ts"),
		serverTypeName: "AdminOptions",
		clientTypeFile: pluginPath("admin/client.ts"),
		clientTypeName: "AdminClientOptions",
	},
	apiKey: {
		serverTypeFile: pluginPath("api-key/types.ts"),
		serverTypeName: "ApiKeyOptions",
		clientTypeFile: pluginPath("api-key/client.ts"),
		clientTypeName: undefined,
	},
	mcp: {
		serverTypeFile: pluginPath("mcp/index.ts"),
		serverTypeName: "MCPOptions",
		clientTypeFile: undefined,
		clientTypeName: undefined,
	},
	organization: {
		serverTypeFile: pluginPath("organization/types.ts"),
		serverTypeName: "OrganizationOptions",
		clientTypeFile: pluginPath("organization/client.ts"),
		clientTypeName: "OrganizationClientOptions",
	},
	oidcProvider: {
		serverTypeFile: pluginPath("oidc-provider/types.ts"),
		serverTypeName: "OIDCOptions",
		clientTypeFile: pluginPath("oidc-provider/client.ts"),
		clientTypeName: undefined,
	},
	sso: {
		serverTypeFile: "sso/src/index.ts",
		serverTypeName: "SSOOptions",
		clientTypeFile: "sso/src/client.ts",
		clientTypeName: undefined,
		importPath: "@better-auth/sso",
		clientImportPath: "@better-auth/sso/client",
	},
	bearer: {
		serverTypeFile: pluginPath("bearer/index.ts"),
		serverTypeName: "BearerOptions",
		clientTypeFile: undefined,
		clientTypeName: undefined,
	},
	deviceAuthorization: {
		serverTypeFile: pluginPath("device-authorization/index.ts"),
		serverTypeName: "DeviceAuthorizationOptions",
		clientTypeFile: pluginPath("device-authorization/client.ts"),
		clientTypeName: undefined,
	}
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
	isOptional: boolean;
	isSelect: boolean;
	isMultiSelect: boolean;
	isConformation: boolean;
	isExample: boolean;
	hasPrompt: boolean;
	defaultValue?: any;
	question?: string;
	exampleValue?: string;
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
	const isOptional = /@cli\s+optional/.test(allJsDocText);
	const isExample = /@cli\s+example/.test(allJsDocText);
	const isMultiSelect = /@cli\s+multi-select/.test(allJsDocText);
	const hasPrompt = /@prompt\b/.test(allJsDocText);

	let isConformation = false;
	// Extract @cli select with optional custom options
	let isSelect = false;
	let selectOptions: { value: string; label: string }[] | undefined;
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
	let defaultValue: any;
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
	let question: string | undefined;
	const questionMatch = allJsDocText.match(/@question\s+(.+?)(?:\n|$)/);
	if (questionMatch) {
		question = questionMatch[1]?.trim();
	}

	// Extract @description tag value (overrides auto-extracted description)
	let descriptionOverride: string | undefined = undefined;
	const descriptionTagMatch = allJsDocText.match(
		/(?:^|\n)\s*\*\s*@description\s+([\s\S]*?)(?=\n\s*\*\s*@|\n\s*\*\/|$)/,
	);
	if (descriptionTagMatch && descriptionTagMatch[1]) {
		// Extract the description content
		let descriptionContent = descriptionTagMatch[1];
		// Remove JSDoc asterisks and whitespace from each line
		descriptionContent = descriptionContent
			.split("\n")
			.map((line) => {
				let cleaned = line;
				cleaned = cleaned.replace(/^\s*\*\s/, "");
				cleaned = cleaned.replace(/^\s*\*+\s(?=\S)/, "");
				cleaned = cleaned.replace(/^\s*\*+\s(?=\s)/, "");
				return cleaned;
			})
			.join("\n");
		descriptionOverride = descriptionContent.trim();
	}

	// Extract @example tag value (multi-line support)
	let exampleValue: string | undefined;
	// Match @example followed by content until next @ tag or end of JSDoc
	// Use a more precise pattern that stops at the next @ tag or closing comment
	// Ensure @example is at the start of a line (after newline and optional JSDoc prefix)
	const exampleMatch = allJsDocText.match(
		/(?:^|\n)\s*\*\s*@example\s+([\s\S]*?)(?=\n\s*\*\s*@|\n\s*\*\/|$)/,
	);
	if (exampleMatch?.[1]) {
		// Extract the example content
		let exampleContent = exampleMatch[1];

		// Check if content is wrapped in markdown code fences (```ts, ```js, ```, etc.)
		// Code fences in JSDoc will have asterisks before each line:
		//  * ```ts
		//  * code here
		//  * ```
		// Pattern: optional asterisk+space, then ```, optional language, newline, content (with asterisks), newline, asterisk+space, ```
		const codeFenceMatch = exampleContent.match(
			/(?:^\s*\*\s*)?```(?:\w+)?\s*\n([\s\S]*?)\n\s*\*\s*```/,
		);
		if (codeFenceMatch?.[1]) {
			// Extract content from code fence and remove JSDoc asterisks
			exampleContent = codeFenceMatch[1];
			// Remove JSDoc asterisks from each line while preserving indentation
			exampleContent = exampleContent
				.split("\n")
				.map((line) => {
					// Remove JSDoc prefix pattern while preserving code indentation
					let cleaned = line;
					cleaned = cleaned.replace(/^\s*\*\s/, "");
					cleaned = cleaned.replace(/^\s*\*+\s(?=\S)/, "");
					cleaned = cleaned.replace(/^\s*\*+\s(?=\s)/, "");
					return cleaned;
				})
				.join("\n");
		} else {
			// Remove leading asterisks and whitespace from each line, but preserve indentation
			exampleContent = exampleContent
				.split("\n")
				.map((line) => {
					// Remove JSDoc prefix pattern while preserving code indentation
					// Standard JSDoc format: " * " (space asterisk space)
					// Handle variations: "* ", " * ", " * * ", etc.
					let cleaned = line;
					// Remove the standard JSDoc prefix " * " (space asterisk space)
					cleaned = cleaned.replace(/^\s*\*\s/, "");
					// If there are still leading asterisks (like "* " after removing " * "), remove them
					// But only remove asterisk followed by exactly one space to preserve code indentation
					cleaned = cleaned.replace(/^\s*\*+\s(?=\S)/, ""); // Match asterisk(s) + one space before non-whitespace
					// Handle case where there are multiple asterisks in a row: " * * "
					// After removing " * ", we might have "*   " - remove "* " but keep the extra spaces
					cleaned = cleaned.replace(/^\s*\*+\s(?=\s)/, ""); // Match asterisk(s) + one space before whitespace (code indentation)
					return cleaned;
				})
				.join("\n");
		}

		// Trim the final result
		exampleContent = exampleContent.trim();

		// Only set if we have content
		if (exampleContent.length > 0) {
			exampleValue = exampleContent;
		}
	}

	// Extract @type override
	let typeOverride: string | undefined;
	let enumValues: string[] | undefined;
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
				if (typeValue === "boolean") {
					isConformation = true;
				}
			}
		}
	}

	// Extract description (everything before first @ tag)
	// Stop at the first @ tag to avoid including multi-line @example content
	const firstAtTagIndex = allJsDocText.search(/(?:^|\n)\s*\*\s*@/);
	let descriptionText = allJsDocText;
	if (firstAtTagIndex !== -1) {
		descriptionText = allJsDocText.substring(0, firstAtTagIndex);
	}

	// Remove JSDoc comment markers and tags
	const descriptionLines = descriptionText
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

	// Use @description override if present, otherwise use auto-extracted description
	const finalDescription = descriptionOverride || description || "";

	return {
		hasCliTag,
		shouldSkip,
		isRequired,
		isOptional,
		isSelect,
		isMultiSelect,
		isExample,
		hasPrompt,
		defaultValue,
		question,
		exampleValue,
		description: finalDescription,
		selectOptions,
		type: typeOverride,
		enumValues,
		isConformation,
	};
}

/**
 * Generate Zod schema from TypeScript type
 */
export function generateZodSchema(
	type: any,
	typeOverride?: string,
	enumValues?: string[],
	isRequired?: boolean,
	isOptional?: boolean,
): string {
	// If type override is provided, use it directly
	if (typeOverride) {
		let schema = "";

		// Check if type override includes array syntax (e.g., "string[]", "number[]")
		const isArrayOverride = typeOverride.endsWith("[]");
		const baseTypeOverride = isArrayOverride
			? typeOverride.slice(0, -2)
			: typeOverride;

		// Handle enum type
		if (baseTypeOverride === "enum" && enumValues && enumValues.length > 0) {
			schema = `z.enum([${enumValues.map((v) => `"${v}"`).join(", ")}])`;
		} else {
			switch (baseTypeOverride) {
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

		// Wrap in array if override specified array
		if (isArrayOverride) {
			schema = `${schema}.array()`;
		}

		// Check if the original type is optional
		const typeText = type.getText();
		const typeIsOptional = type.isNullable() || type.isUndefined();

		// @cli required overrides type optionality
		if (isRequired) {
			// Don't add .optional() even if type is optional
		} else if (isOptional) {
			// @cli optional forces optional
			schema += ".optional()";
		} else if (typeIsOptional && !typeText.includes("required")) {
			// Default behavior: respect type optionality
			schema += ".optional()";
		}

		return schema;
	}

	const typeText = type.getText();
	const typeIsOptional = type.isNullable() || type.isUndefined();

	let schema = "";

	// Check if this is an array type
	const isArrayType =
		(typeof type.isArray === "function" && type.isArray()) ||
		typeText.includes("[]");
	let elementType = type;
	let elementTypeText = typeText;

	if (isArrayType) {
		// Extract element type from array
		if (typeof type.isArray === "function" && type.isArray()) {
			// Use ts-morph's array element type if available
			const arrayElementType = (type as any).getArrayElementType?.();
			if (arrayElementType) {
				elementType = arrayElementType;
				elementTypeText = elementType.getText();
			} else {
				// Fallback: extract from type text (e.g., "string[]" -> "string")
				elementTypeText = typeText.replace(/\[\]$/, "").trim();
			}
		} else {
			// Extract from type text (e.g., "string[]" -> "string")
			elementTypeText = typeText.replace(/\[\]$/, "").trim();
		}
	}

	// Check for union types (enums) - but only if not an array
	if (!isArrayType && type.isUnion()) {
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

		// Check if union contains boolean types
		const hasBoolean = unionTypes.some(
			(t: any) =>
				t.getText().includes("boolean") ||
				t.getSymbol()?.getName() === "Boolean",
		);

		if (hasBoolean) {
			// If union contains boolean, treat as boolean (e.g., "boolean | undefined")
			schema = "z.coerce.boolean()";
		} else if (
			stringLiterals.length > 0 &&
			stringLiterals.length === unionTypes.length
		) {
			schema = `z.enum([${stringLiterals.map((v: string) => `"${v}"`).join(", ")}])`;
		} else {
			schema = "z.coerce.string()";
		}
	} else if (
		elementTypeText.includes("boolean") ||
		elementType.getSymbol()?.getName() === "Boolean" ||
		(typeOverride && typeOverride === "boolean")
	) {
		schema = "z.coerce.boolean()";
	} else if (
		elementTypeText.includes("string") ||
		elementType.getSymbol()?.getName() === "String"
	) {
		schema = "z.coerce.string()";
	} else if (
		elementTypeText.includes("number") ||
		elementType.getSymbol()?.getName() === "Number"
	) {
		schema = "z.coerce.number()";
	} else {
		schema = "z.coerce.string()";
	}

	// Wrap in array if needed
	if (isArrayType) {
		schema = `${schema}.array()`;
	}

	// @cli required overrides type optionality
	if (isRequired) {
		// Don't add .optional() even if type is optional
	} else if (isOptional) {
		// @cli optional forces optional
		schema += ".optional()";
	} else if (typeIsOptional && !typeText.includes("required")) {
		// Default behavior: respect type optionality
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
	let nestedOptions: GetArgumentsOption[] | undefined;

	// Extract type name from the type text (handles Omit<>, direct types, etc.)
	let typeNameToFind: string | undefined;
	const omittedProperties: string[] = [];
	const typeSymbol = type.getSymbol();

	// Handle Omit<> utility type - extract the base type name
	if (typeText.includes("Omit<")) {
		const omitMatch = typeText.match(/Omit<([^,]+),/);
		if (omitMatch?.[1]) {
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
	let schema =
		nestedOptions && nestedOptions.length > 0
			? undefined
			: generateZodSchema(
					type,
					tags.type,
					tags.enumValues,
					tags.isRequired,
					tags.isOptional,
				);

	// If @cli example is present, infer schema type from @type tag if available
	// Otherwise, default to string for function examples
	if (tags.isExample && schema && !schema.startsWith("z.enum")) {
		if (tags.type) {
			// Use the type override from @type tag
			switch (tags.type) {
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
		} else {
			// Default to string for function examples when no @type is specified
			schema = "z.coerce.string()";
		}
		// Apply optional/required modifiers
		if (tags.isRequired) {
			// Keep as required (no .optional())
		} else if (tags.isOptional) {
			schema += ".optional()";
		} else {
			// Check type optionality
			const typeText = type.getText();
			const typeIsOptional = type.isNullable() || type.isUndefined();
			if (typeIsOptional && !typeText.includes("required")) {
				schema += ".optional()";
			}
		}
	}

	// Check if this is a select/enum type
	let isSelectOptions: { value: any; label?: string }[] | undefined;
	let isMultiselectOptions: { value: any; label?: string }[] | undefined;

	// Extract enum values from z.enum schema if no custom select options are provided
	if (schema?.startsWith("z.enum([")) {
		// Extract enum values from schema string: z.enum(["value1", "value2", ...]) or z.enum(["value1", "value2", ...]).optional()
		const enumMatch = schema.match(/z\.enum\(\[(.*?)\]\)/);
		if (enumMatch?.[1]) {
			// Parse the enum values (they're quoted strings separated by commas)
			const enumValues = enumMatch[1]
				.split(",")
				.map((v) => v.trim().replace(/^["']|["']$/g, ""))
				.filter((v) => v.length > 0);

			if (enumValues.length > 0 && !tags.selectOptions) {
				// Convert enum values to select options
				const options = enumValues.map((v: string) => ({
					value: v,
					label: toTitleCase(v),
				}));
				// Use multi-select if explicitly requested, otherwise use regular select
				if (tags.isMultiSelect) {
					isMultiselectOptions = options;
				} else {
					isSelectOptions = options;
				}
			}
		}
	}

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
		skipPrompt: tags.isExample ? true : !tags.hasPrompt, // @cli example forces skipPrompt, otherwise default: skip prompt unless @prompt tag is present
		...(tags.isRequired && { isRequired: true }),
		argument: {
			index: 0,
			isProperty: propertyName,
			...(schema !== undefined && { schema }),
		},
	};

	// Add cliTransform for array types to convert string input into arrays before schema validation
	if (schema && schema.includes(".array()")) {
		// Extract the element type from the schema to determine conversion
		const isStringArray = schema.includes("z.coerce.string().array()");
		const isNumberArray = schema.includes("z.coerce.number().array()");
		const isBooleanArray = schema.includes("z.coerce.boolean().array()");

		// Use JSON.parse to handle array input from CLI
		// This supports both JSON array strings like "[1,2,3]" and comma-separated strings like "1,2,3"
		if (isStringArray) {
			option.cliTransform = (value: any) => {
				if (typeof value === "string") {
					try {
						const parsed = JSON.parse(value);
						if (Array.isArray(parsed)) {
							return parsed;
						}
					} catch {
						return value
							.split(",")
							.map((v) => v.trim())
							.filter((v) => v.length > 0);
					}
				}
				if (Array.isArray(value)) {
					return value;
				}
				return value;
			};
		} else if (isNumberArray) {
			option.cliTransform = (value: any) => {
				if (typeof value === "string") {
					try {
						const parsed = JSON.parse(value);
						if (Array.isArray(parsed)) {
							return parsed;
						}
					} catch {
						return value
							.split(",")
							.map((v) => Number(v.trim()))
							.filter((v) => !isNaN(v));
					}
				}
				if (Array.isArray(value)) {
					return value;
				}
				return value;
			};
		} else if (isBooleanArray) {
			option.cliTransform = (value: any) => {
				if (typeof value === "string") {
					try {
						const parsed = JSON.parse(value);
						if (Array.isArray(parsed)) {
							return parsed;
						}
					} catch {
						return value.split(",").map((v) => {
							const trimmed = v.trim().toLowerCase();
							return trimmed === "true" || trimmed === "1";
						});
					}
				}
				if (Array.isArray(value)) {
					return value;
				}
				return value;
			};
		} else {
			// Generic array transform
			option.cliTransform = (value: any) => {
				if (typeof value === "string") {
					try {
						const parsed = JSON.parse(value);
						if (Array.isArray(parsed)) {
							return parsed;
						}
					} catch {
						return value
							.split(",")
							.map((v) => v.trim())
							.filter((v) => v.length > 0);
					}
				}
				if (Array.isArray(value)) {
					return value;
				}
				return value;
			};
		}
	}

	// Only set question if this is NOT a nested object
	// Nested objects don't need questions as they're composite types
	if (!nestedOptions || nestedOptions.length === 0) {
		option.question = question;
	}

	// Only set defaultValue if this is NOT a nested object
	// Nested objects should have their defaults set on individual properties, not the parent
	if (!nestedOptions || nestedOptions.length === 0) {
		// Priority: @example (when @cli example) > @default > type-based defaults
		// @cli example expects an @example tag which will be used as defaultValue
		if (tags.isExample) {
			if (tags.exampleValue !== undefined) {
				// Remove code fence markers if present (they might have been included in extraction)
				let exampleValue = tags.exampleValue;
				// Remove any leading/trailing code fence markers that might have been missed
				exampleValue = exampleValue
					.replace(/^```\w*\s*\n?/g, "")
					.replace(/\n?\s*```$/g, "");
				option.defaultValue = exampleValue.trim();
			}
			// If no @example tag is present but @cli example is set, that's okay - defaultValue will be undefined
		} else if (tags.defaultValue !== undefined) {
			option.defaultValue = tags.defaultValue;
		}
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
	if (schema?.includes("number")) {
		option.isNumber = true;
	}

	// Check if it's a boolean type - set isConformation for boolean prompts
	// Check both schema string and type text to detect boolean types
	// Only set for non-nested objects (nested objects shouldn't have confirmation prompts)
	// Don't set for @cli example with @type function (those are function examples, not booleans)
	// Also check that the actual property type is boolean, not just that "boolean" appears in the type text
	// (e.g., Promise<boolean> should not set isConformation)
	if (!nestedOptions && !(tags.isExample && tags.type === "function")) {
		// Check if the schema explicitly includes boolean (most reliable)
		// Check for "z.coerce.boolean()" which may be followed by .optional() or .array()
		const schemaIsBoolean = schema?.includes("z.coerce.boolean()");
		// Check if tags.type override is boolean
		const typeOverrideIsBoolean = tags.type === "boolean";
		// Check if the type symbol is Boolean (but not Promise<Boolean>)
		const typeSymbolIsBoolean = type.getSymbol()?.getName() === "Boolean";
		// Check typeText but exclude Promise<boolean> patterns
		const typeTextIsBoolean =
			typeText.includes("boolean") &&
			!typeText.includes("Promise") &&
			!typeText.includes("=>");

		const isBooleanType =
			schemaIsBoolean ||
			typeOverrideIsBoolean ||
			(typeSymbolIsBoolean && !typeText.includes("Promise")) ||
			typeTextIsBoolean;

		if (isBooleanType) {
			option.isConformation = true;
		}
	}

	if (tags.isConformation) {
		option.isConformation = true;
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
	clientConfig: GetArgumentsOption[];
	displayName: string;
	importPath: string;
	clientImportPath: string;
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

	// Process client type file if it exists
	let clientArgumentsList: GetArgumentsOption[] = [];
	if (pluginInfo.clientTypeFile && pluginInfo.clientTypeName) {
		const clientTypeFile = project.addSourceFileAtPath(
			path.resolve(ROOT_DIR, pluginInfo.clientTypeFile),
		);

		// Find the client type - try interface first, then type alias
		let clientTypeNode:
			| ReturnType<typeof clientTypeFile.getInterfaces>[number]
			| ReturnType<typeof clientTypeFile.getTypeAliases>[number]
			| undefined;

		const clientInterfaceNode = clientTypeFile
			.getInterfaces()
			.find((iface) => iface.getName() === pluginInfo.clientTypeName);
		if (clientInterfaceNode) {
			clientTypeNode = clientInterfaceNode;
		} else {
			clientTypeNode = clientTypeFile
				.getTypeAliases()
				.find((alias) => alias.getName() === pluginInfo.clientTypeName);
		}

		if (clientTypeNode) {
			const clientType = clientTypeNode.getType();

			// Process client properties - only those with @cli tag
			const clientProperties = clientType.getProperties();
			clientArgumentsList = clientProperties
				.map((prop) => {
					const declarations = prop.getDeclarations();
					if (declarations.length === 0) return null;
					// Use pluginName + "Client" as prefix for client properties
					return processProperty(
						declarations[0],
						`${pluginName}Client`,
						"",
						project,
						0,
					);
				})
				.filter((opt): opt is GetArgumentsOption => opt !== null);
		}
	}

	// Generate import path
	const importPath = pluginInfo.importPath || "better-auth/plugins";
	const functionName = pluginName;
	const clientImportPath =
		pluginInfo.clientImportPath || "better-auth/client/plugins";

	return {
		pluginConfig: argumentsList,
		clientConfig: clientArgumentsList,
		displayName,
		importPath,
		clientImportPath,
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

	const clientArgumentsCode =
		pluginData.hasClient && pluginData.clientConfig.length > 0
			? `arguments: [\n${pluginData.clientConfig
					.map((arg) => generateArgumentCode(arg))
					.join(",\n")}\n\t\t],`
			: "";

	const authClientCode = pluginData.hasClient
		? `{
		function: "${pluginData.functionName}Client",
		imports: [
			{
				path: "${pluginData.clientImportPath}",
				imports: [createImport({ name: "${pluginData.functionName}Client" })],
				isNamedImport: false,
			},
		],
		${clientArgumentsCode}
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
		// Use JSON.stringify to properly escape quotes and other special characters
		parts.push(`${indent}\tdescription: ${JSON.stringify(arg.description)},`);
	}
	if (arg.question) {
		// Use JSON.stringify to properly escape quotes and other special characters
		parts.push(`${indent}\tquestion: ${JSON.stringify(arg.question)},`);
	}
	if (
		arg.defaultValue !== undefined &&
		(!arg.isNestedObject || arg.isNestedObject.length === 0)
	) {
		let defaultValueStr: string;
		if (typeof arg.defaultValue === "string") {
			// Check if it's a multi-line code block (contains newlines)
			if (arg.defaultValue.includes("\n")) {
				// For multi-line code blocks, use template literal with proper escaping
				// Escape backticks and ${} in the code
				const escapedCode = arg.defaultValue
					.replace(/\\/g, "\\\\")
					.replace(/`/g, "\\`")
					.replace(/\${/g, "\\${");
				defaultValueStr = `\`${escapedCode}\``;
			} else if (
				arg.defaultValue.trim().startsWith("{") &&
				arg.defaultValue.trim().endsWith("}")
			) {
				// Try to parse as JSON to validate, then stringify it properly
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
	if (arg.cliTransform) {
		// Output cliTransform as a function string
		const transformCode = arg.cliTransform.toString();
		parts.push(`${indent}\tcliTransform: ${transformCode},`);
	}
	if (arg.isRequired !== undefined) {
		parts.push(`${indent}\tisRequired: ${arg.isRequired},`);
	}
	if (arg.isNumber) {
		parts.push(`${indent}\tisNumber: true,`);
	}
	if (arg.isConformation !== undefined) {
		parts.push(`${indent}\tisConformation: ${arg.isConformation},`);
	}
	if (arg.isSelectOptions) {
		parts.push(
			`${indent}\tisSelectOptions: [\n${arg.isSelectOptions
				.map(
					(opt) =>
						`${indent}\t\t{ value: ${JSON.stringify(opt.value)}, label: ${JSON.stringify(opt.label || toTitleCase(opt.value))} }`,
				)
				.join(",\n")}\n${indent}\t],`,
		);
	}
	if (arg.isMultiselectOptions) {
		parts.push(
			`${indent}\tisMultiselectOptions: [\n${arg.isMultiselectOptions
				.map(
					(opt) =>
						`${indent}\t\t{ value: ${JSON.stringify(opt.value)}, label: ${JSON.stringify(opt.label || toTitleCase(opt.value))} }`,
				)
				.join(",\n")}\n${indent}\t],`,
		);
	}
	if (arg.isNestedObject && arg.isNestedObject.length > 0) {
		parts.push(
			`${indent}\tisNestedObject: [\n${arg.isNestedObject
				.map((nested) => generateArgumentCode(nested, `${indent}\t`))
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
