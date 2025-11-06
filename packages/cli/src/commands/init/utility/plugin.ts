import {
	type Plugin,
	type PluginConfig,
	pluginsConfig,
} from "../configs/plugins-index.config";
import type { GetArgumentsFn, GetArgumentsOptions } from "../generate-auth";
import { formatCode } from "./format";

export const getPluginConfigs = (plugins: Plugin[]) => {
	return plugins.map((plugin) => {
		const pluginConfig = pluginsConfig[plugin];
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
			const result = await getArguments(nestedArg);
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

export const getAuthPluginsCode = async ({
	getArguments,
	plugins,
}: {
	plugins?: PluginConfig[];
	getArguments: GetArgumentsFn;
}) => {
	if (!plugins || plugins.length === 0) return;
	let pluginsCode: string[] = [];
	for (const plugin of plugins) {
		let argumentsCode: Map<number, any> = new Map();
		if (plugin.auth.arguments) {
			for (const argument of plugin.auth.arguments) {
				let value: any;

				// Check if this argument has nested objects
				if (argument.isNestedObject && Array.isArray(argument.isNestedObject)) {
					// Process nested arguments recursively
					value = await processNestedArguments(
						argument.isNestedObject,
						getArguments,
					);
					// Validate the nested object if there's a schema
					if (argument.argument.schema) {
						const schema = argument.argument.schema.safeParse(value);
						if (!schema.success) {
							throw new Error(
								`Invalid nested object for ${plugin.auth.function}: ${schema.error.message}`,
							);
						}
						value = schema.data;
					}
				} else {
					// Process regular argument
					const result = await getArguments(argument);
					const schema = argument.argument.schema?.safeParse(result) ?? {
						success: true,
						data: result,
					};
					if (!schema.success) {
						throw new Error(
							`Invalid argument for ${plugin.auth.function} on flag "${argument.flag}": ${schema.error.message}`,
						);
					}
					value = schema.data;
				}

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
		}

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
			if (
				typeof value === "object" &&
				value !== null &&
				!Array.isArray(value)
			) {
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

		// convert argumentsCode to an array of values
		let args: string[] = Array.from(argumentsCode.values()).map((value) => {
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
				const hasFunctionString = (obj: any): boolean => {
					for (const val of Object.values(obj)) {
						if (typeof val === "string" && val.includes("=>")) {
							return true;
						}
						if (
							typeof val === "object" &&
							val !== null &&
							!Array.isArray(val)
						) {
							if (hasFunctionString(val)) return true;
						}
					}
					return false;
				};

				if (hasFunctionString(cleaned)) {
					// Build object with functions output directly (recursively)
					const buildObjectString = (obj: any): string => {
						const entries = Object.entries(obj).map(([key, val]) => {
							if (typeof val === "string" && val.includes("=>")) {
								// Output function directly, not as a string
								return `${key}: ${val}`;
							}
							if (
								typeof val === "object" &&
								val !== null &&
								!Array.isArray(val)
							) {
								return `${key}: ${buildObjectString(val)}`;
							}
							return `${key}: ${JSON.stringify(val)}`;
						});
						return `{${entries.join(", ")}}`;
					};
					return buildObjectString(cleaned);
				}
			}
			return JSON.stringify(cleaned);
		});

		// Remove trailing undefined values
		for (let i = args.length - 1; i >= 0; i--) {
			if (args[i] !== "undefined") break;
			args.pop();
		}

		pluginsCode.push(`${plugin.auth.function}(${args.join(", ")})`);
	}
	return (await formatCode(`[${pluginsCode.join(", ")}]`)).trim().slice(0, -1);
};
