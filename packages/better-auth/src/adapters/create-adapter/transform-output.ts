import type { BetterAuthDbSchema } from "../../db";
import type { BetterAuthOptions } from "../../types";
import { safeJSONParse } from "../../utils/json";
import type { AdapterConfig } from "./types";

export const initTransformOutput = ({
	config,
	schema,
	options,
}: {
	config: AdapterConfig;
	schema: BetterAuthDbSchema;
	options: BetterAuthOptions;
}) => {
	const transformOutput = async (
		data: Record<string, any> | null,
		unsafe_model: string,
		select: string[] = [],
	) => {
		if (!data) return null;
		const newMappedKeys = config.mapKeysTransformOutput ?? {};
		const transformedData: Record<string, any> = {};
		const tableSchema = schema[unsafe_model].fields;
		const idKey = Object.entries(newMappedKeys).find(
			([_, v]) => v === "id",
		)?.[0];
		tableSchema[idKey ?? "id"] = {
			type: options.advanced?.database?.useNumberId ? "number" : "string",
		};
		for (const key in tableSchema) {
			if (select.length && !select.includes(key)) {
				continue;
			}
			const field = tableSchema[key];
			if (field) {
				const originalKey = field.fieldName || key;
				// If the field is mapped, we'll use the mapped key. Otherwise, we'll use the original key.
				let newValue =
					data[
						Object.entries(newMappedKeys).find(
							([_, v]) => v === originalKey,
						)?.[0] || originalKey
					];

				if (field.transform?.output) {
					newValue = await field.transform.output(newValue);
				}

				let newFieldName: string = newMappedKeys[key] || key;

				if (originalKey === "id" || field.references?.field === "id") {
					// Even if `useNumberId` is true, we must always return a string `id` output.
					if (typeof newValue !== "undefined") newValue = String(newValue);
				} else if (
					config.supportsJSON === false &&
					typeof newValue === "string" &&
					//@ts-expect-error - Future proofing
					field.type === "json"
				) {
					newValue = safeJSONParse(newValue);
				} else if (
					config.supportsJSONB === false &&
					typeof newValue === "string" &&
					//@ts-expect-error - Future proofing
					field.type === "jsonb"
				) {
					newValue = safeJSONParse(newValue);
				} else if (
					config.supportsDates === false &&
					typeof newValue === "string" &&
					field.type === "date"
				) {
					newValue = new Date(newValue);
				} else if (
					config.supportsBooleans === false &&
					field.type === "boolean"
				) {
					if (config.supportsNumbers === false) {
						newValue = newValue === "1";
					} else {
						newValue = newValue === 1;
					}
				} else if (
					config.supportsArrays === false &&
					typeof newValue === "string" &&
					(field.type === "number[]" || field.type === "string[]")
				) {
					newValue = safeJSONParse(newValue);
				} else if (
					config.supportsNumbers === false &&
					field.type === "number"
				) {
					newValue = Number(newValue);
				}

				if (config.customTransformOutput) {
					newValue = config.customTransformOutput({
						data: newValue,
						field: newFieldName,
						fieldAttributes: field,
						select,
						model: unsafe_model,
						schema,
						options,
					});
				}

				transformedData[newFieldName] = newValue;
			}
		}
		return transformedData as any;
	};
	return transformOutput;
};
