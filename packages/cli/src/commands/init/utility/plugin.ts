import type { Awaitable } from "@better-auth/core";
import type { Plugin, PluginConfig } from "../configs/temp-plugins.config";
import { tempPluginsConfig } from "../configs/temp-plugins.config";
import type { GetArgumentsFn, GetArgumentsOptions } from "../generate-auth";
import { formatCode } from "./format";
import { getArgumentsPrompt } from "./prompt";

export const getPluginConfigs = (plugins: Plugin[]) => {
	return plugins.map((plugin) => {
		const pluginConfig = tempPluginsConfig[plugin];
		if (!pluginConfig) {
			throw new Error(`Plugin ${plugin} not found`);
		}
		return pluginConfig;
	});
};

/**
 * Helper function to process nested arguments and build a nested object
 */
const processNestedArguments = async (
	nestedArguments: GetArgumentsOptions[],
	getArguments: GetArgumentsFn,
): Promise<Record<string, any>> => {
	const nestedObject: Record<string, any> = {};

	for (const nestedArg of nestedArguments) {
		let nestedValue: any;

		// Check if this nested argument itself has nested objects
		if (nestedArg.isNestedObject && Array.isArray(nestedArg.isNestedObject)) {
			// Recursively process nested objects
			nestedValue = await processNestedArguments(
				nestedArg.isNestedObject,
				getArguments,
			);
		} else {
			// Process regular nested argument
			let result = await getArguments(nestedArg);
			// Apply cliTransform if provided
			if (nestedArg.cliTransform) {
				result = nestedArg.cliTransform(result);
			}
			const schema = nestedArg.argument.schema?.safeParse(result) ?? {
				success: true,
				data: result,
			};
			if (!schema.success) {
				throw new Error(`Invalid nested argument: ${schema.error.message}`);
			}
			nestedValue = schema.data;
		}

		// If the nested argument has a property name, merge it with existing properties
		if (nestedArg.argument.isProperty) {
			const propertyName = nestedArg.argument.isProperty;
			if (typeof nestedValue !== "undefined") {
				// If property already exists and both are objects, merge them
				if (
					nestedObject[propertyName] &&
					typeof nestedObject[propertyName] === "object" &&
					typeof nestedValue === "object" &&
					nestedValue !== null &&
					!(typeof nestedValue === "string" && nestedValue.includes("=>"))
				) {
					nestedObject[propertyName] = {
						...nestedObject[propertyName],
						...nestedValue,
					};
				} else {
					nestedObject[propertyName] = nestedValue;
				}
			}
		} else if (typeof nestedValue !== "undefined") {
			// If no property name, this shouldn't happen in nested objects, but handle it anyway
			throw new Error(`Nested argument must have isProperty set`);
		}
	}

	return nestedObject;
};

/**
 * Recursively clean objects by removing undefined values and setting empty nested objects to undefined
 */
const cleanNestedObjects = (value: any): any => {
	if (typeof value === "undefined") {
		return undefined;
	}
	// Don't process function strings - they should be preserved as-is
	if (typeof value === "string" && value.includes("=>")) {
		return value;
	}
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		const cleaned: Record<string, any> = {};
		for (const [key, val] of Object.entries(value)) {
			const cleanedValue = cleanNestedObjects(val);
			if (typeof cleanedValue !== "undefined") {
				cleaned[key] = cleanedValue;
			}
		}
		// If the object is empty after cleaning, return undefined
		if (Object.keys(cleaned).length === 0) {
			return undefined;
		}
		return cleaned;
	}
	return value;
};

/**
 * Process a single argument (handles both nested and regular arguments)
 */
const processArgument = async (
	argument: GetArgumentsOptions,
	getArguments: GetArgumentsFn,
	functionName: string,
): Promise<any> => {
	let value: any;

	// Check if this argument has nested objects
	if (argument.isNestedObject && Array.isArray(argument.isNestedObject)) {
		// Process nested arguments recursively
		value = await processNestedArguments(argument.isNestedObject, getArguments);
		// Validate the nested object if there's a schema
		if (argument.argument.schema) {
			const schema = argument.argument.schema.safeParse(value);
			if (!schema.success) {
				throw new Error(
					`Invalid nested object for ${functionName}: ${schema.error.message}`,
				);
			}
			value = schema.data;
		}
	} else {
		// Process regular argument
		let result = await getArguments(argument);
		// Apply cliTransform if provided
		if (argument.cliTransform) {
			result = argument.cliTransform(result);
		}
		const schema = argument.argument.schema?.safeParse(result) ?? {
			success: true,
			data: result,
		};
		if (!schema.success) {
			throw new Error(
				`Invalid argument for ${functionName} on flag "${argument.flag}": ${schema.error.message}`,
			);
		}
		value = schema.data;
	}

	return value;
};

/**
 * Build argumentsCode map from arguments array
 */
const buildArgumentsCode = async (
	argumentOptions: GetArgumentsOptions[] | undefined,
	getArguments: GetArgumentsFn,
	functionName: string,
): Promise<Map<number, any>> => {
	const argumentsCode: Map<number, any> = new Map();
	if (!argumentOptions) return argumentsCode;

	for (const argument of argumentOptions) {
		const value = await processArgument(argument, getArguments, functionName);
		const index = argument.argument.index;
		if (argument.argument.isProperty) {
			if (argumentsCode.has(index)) {
				const previous = argumentsCode.get(index) || {};
				if (typeof previous !== "object") {
					throw new Error(`Argument at index ${index} is not an object`);
				}
				argumentsCode.set(index, {
					...previous,
					[argument.argument.isProperty]: value,
				});
			} else {
				argumentsCode.set(index, {
					[argument.argument.isProperty]: value,
				});
			}
		} else {
			argumentsCode.set(index, value);
		}
	}

	return argumentsCode;
};

/**
 * Convert argumentsCode map to an array of string values
 */
const convertArgumentsCodeToStringArray = (
	argumentsCode: Map<number, any>,
): string[] => {
	const hasFunctionString = (obj: any): boolean => {
		for (const val of Object.values(obj)) {
			if (typeof val === "string" && val.includes("=>")) {
				return true;
			}
			if (typeof val === "object" && val !== null && !Array.isArray(val)) {
				if (hasFunctionString(val)) return true;
			}
		}
		return false;
	};

	const buildObjectString = (obj: any): string => {
		const entries = Object.entries(obj).map(([key, val]) => {
			if (typeof val === "string" && val.includes("=>")) {
				// Output function directly, not as a string
				return `${key}: ${val}`;
			}
			if (typeof val === "object" && val !== null && !Array.isArray(val)) {
				return `${key}: ${buildObjectString(val)}`;
			}
			return `${key}: ${JSON.stringify(val)}`;
		});
		return `{${entries.join(", ")}}`;
	};

	return Array.from(argumentsCode.values()).map((value) => {
		const cleaned = cleanNestedObjects(value);
		if (typeof cleaned === "undefined") return "undefined";
		// Handle function strings - they should be output as actual functions, not strings
		if (typeof cleaned === "string" && cleaned.includes("=>")) {
			// Check if it's a function string (contains arrow function syntax)
			// Output it directly as a function, not as a string
			return cleaned;
		}
		// For objects, check if any property contains a function string (recursively)
		if (
			typeof cleaned === "object" &&
			cleaned !== null &&
			!Array.isArray(cleaned)
		) {
			if (hasFunctionString(cleaned)) {
				// Build object with functions output directly (recursively)
				return buildObjectString(cleaned);
			}
		}
		return JSON.stringify(cleaned);
	});
};

/**
 * Remove trailing undefined values from args array
 */
const removeTrailingUndefined = (args: string[]): void => {
	for (let i = args.length - 1; i >= 0; i--) {
		if (args[i] !== "undefined") break;
		args.pop();
	}
};

export const getAuthPluginsCode = async ({
	plugins,
	options = {},
	installDependency,
}: {
	plugins?: PluginConfig[];
	options?: Record<string, unknown>;
	installDependency: (
		dependencies: string | string[],
		type?: "dev" | "prod",
	) => Awaitable<unknown>;
}) => {
	if (!plugins || plugins.length === 0) return;

	const getArguments = await getArgumentsPrompt(options, plugins, "auth");

	const pluginsCode: string[] = [];
	for (const plugin of plugins) {
		const argumentsCode = await buildArgumentsCode(
			plugin.auth.arguments,
			getArguments,
			plugin.auth.function,
		);
		const args = convertArgumentsCodeToStringArray(argumentsCode);
		removeTrailingUndefined(args);
		pluginsCode.push(`${plugin.auth.function}(${args.join(", ")})`);

		// dependencies
		const dependencies = new Set<string>([
			...(plugin.dependencies || []),
			...(plugin.auth.dependencies || []),
		]);
		const devDependencies = new Set<string>([
			...(plugin.devDependencies || []),
			...(plugin.auth.devDependencies || []),
		]);
		if (dependencies.size > 0) {
			await installDependency([...dependencies]);
		}
		if (devDependencies.size > 0) {
			await installDependency([...devDependencies], "dev");
		}
	}
	return (await formatCode(`[${pluginsCode.join(", ")}]`)).trim().slice(0, -1);
};

export const getAuthClientPluginsCode = async ({
	plugins,
	options = {},
	installDependency,
}: {
	plugins?: PluginConfig[];
	options?: Record<string, unknown>;
	installDependency: (
		dependencies: string | string[],
		type?: "dev" | "prod",
	) => Awaitable<unknown>;
}) => {
	if (!plugins || plugins.length === 0) return;
	const pluginsWithClient = plugins.filter(
		(plugin) => plugin.authClient !== null,
	);
	if (pluginsWithClient.length === 0) return;

	const getArguments = await getArgumentsPrompt(options, plugins, "authClient");

	const pluginsCode: string[] = [];
	for (const plugin of pluginsWithClient) {
		if (!plugin.authClient) continue;
		const argumentsCode = await buildArgumentsCode(
			plugin.authClient.arguments,
			getArguments,
			plugin.authClient.function,
		);
		const args = convertArgumentsCodeToStringArray(argumentsCode);
		removeTrailingUndefined(args);
		pluginsCode.push(`${plugin.authClient.function}(${args.join(", ")})`);

		// dependencies
		const dependencies = new Set<string>([
			...(plugin.dependencies || []),
			...(plugin.authClient.dependencies || []),
		]);
		const devDependencies = new Set<string>([
			...(plugin.devDependencies || []),
			...(plugin.authClient.devDependencies || []),
		]);
		if (dependencies.size > 0) {
			await installDependency([...dependencies]);
		}
		if (devDependencies.size > 0) {
			await installDependency([...devDependencies], "dev");
		}
	}
	return (await formatCode(`[${pluginsCode.join(", ")}]`)).trim().slice(0, -1);
};
