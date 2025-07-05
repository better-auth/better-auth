import type { BetterAuthDbSchema } from "../../db";
import { type BetterAuthOptions } from "../../types";
import { withApplyDefault } from "../utils";
import type { AdapterConfig, IdField } from "./types";

export const initTransformInput = ({
	schema,
	config,
	options,
	idField,
}: {
	schema: BetterAuthDbSchema;
	config: AdapterConfig;
	options: BetterAuthOptions;
	idField: IdField;
}) => {
	const transformInput = async (
		data: Record<string, any>,
		unsafe_model: string,
		action: "create" | "update",
		forceAllowId?: boolean,
	) => {
		const transformedData: Record<string, any> = {};
		if (!schema[unsafe_model]) {
			const err = new Error(`Model ${unsafe_model} not found in schema`);
			err.stack = err.stack
				?.split("\n")
				.filter((_, i) => i !== 1)
				.join("\n");

			throw err;
		}
		const fields = schema[unsafe_model].fields;
		const newMappedKeys = config.mapKeysTransformInput ?? {};
		if (
			!config.disableIdGeneration &&
			!options.advanced?.database?.useNumberId
		) {
			fields.id = idField({
				customModelName: unsafe_model,
				forceAllowId: forceAllowId && "id" in data,
			});
		}
		for (const field in fields) {
			const value = data[field];
			const fieldAttributes = fields[field];

			let newFieldName: string =
				newMappedKeys[field] || fields[field].fieldName || field;
			if (
				value === undefined &&
				((!fieldAttributes.defaultValue && !fieldAttributes.transform?.input) ||
					action === "update")
			) {
				continue;
			}
			// If the value is undefined, but the fieldAttr provides a `defaultValue`, then we'll use that.
			let newValue = withApplyDefault(value, fieldAttributes, action);

			// If the field attr provides a custom transform input, then we'll let it handle the value transformation.
			// Afterwards, we'll continue to apply the default transformations just to make sure it saves in the correct format.
			if (fieldAttributes.transform?.input) {
				newValue = await fieldAttributes.transform.input(newValue);
			}
			if (
				fieldAttributes.references?.field === "id" &&
				options.advanced?.database?.useNumberId
			) {
				if (Array.isArray(newValue)) {
					newValue = newValue.map(Number);
				} else {
					newValue = Number(newValue);
				}
			} else if (
				!fieldAttributes.required &&
				(newValue === null || newValue === undefined)
			) {
				newValue = null;
			} else if (
				config.supportsJSON === false &&
				fieldAttributes.type === "json"
			) {
				newValue = JSON.stringify(newValue);
			} else if (
				config.supportsJSONB === false &&
				fieldAttributes.type === "jsonb" &&
				!config.supportsJSON
			) {
				newValue = JSON.stringify(newValue);
			} else if (
				config.supportsDates === false &&
				newValue instanceof Date &&
				fieldAttributes.type === "date"
			) {
				newValue = newValue.toISOString();
			} else if (
				config.supportsBooleans === false &&
				typeof newValue === "boolean"
			) {
				if (config.supportsNumbers === false) {
					newValue = newValue ? "1" : "0";
				} else {
					newValue = newValue ? 1 : 0;
				}
			} else if (
				config.supportsArrays === false &&
				(fieldAttributes.type === "number[]" ||
					fieldAttributes.type === "string[]")
			) {
				newValue = JSON.stringify(newValue);
			} else if (
				config.supportsNumbers === false &&
				fieldAttributes.type === "number"
			) {
				newValue = String(newValue);
			}

			if (config.customTransformInput) {
				newValue = config.customTransformInput({
					data: newValue,
					action,
					field: newFieldName,
					fieldAttributes: fieldAttributes,
					model: unsafe_model,
					schema,
					options,
				});
			}

			transformedData[newFieldName] = newValue;
		}
		return transformedData;
	};

	return transformInput;
};
