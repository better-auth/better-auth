import { BetterAuthError } from "../../error/index.js";
import type { BetterAuthOptions } from "../../types/index.js";
import type { BetterAuthDBSchema } from "../type.js";
import { initGetDefaultFieldName } from "./get-default-field-name.js";
import { initGetDefaultModelName } from "./get-default-model-name.js";
import { initGetIdField } from "./get-id-field.js";

export const initGetFieldAttributes = ({
	usePlural,
	schema,
	options,
	customIdGenerator,
	disableIdGeneration,
}: {
	usePlural?: boolean;
	schema: BetterAuthDBSchema;
	options: BetterAuthOptions;
	disableIdGeneration?: boolean;
	customIdGenerator?: ((props: { model: string }) => string) | undefined;
}) => {
	const getDefaultModelName = initGetDefaultModelName({
		usePlural,
		schema,
	});

	const getDefaultFieldName = initGetDefaultFieldName({
		usePlural,
		schema,
	});

	const idField = initGetIdField({
		usePlural,
		schema,
		options,
		customIdGenerator,
		disableIdGeneration,
	});

	const getFieldAttributes = ({
		model,
		field,
	}: {
		model: string;
		field: string;
	}) => {
		const defaultModelName = getDefaultModelName(model);
		const defaultFieldName = getDefaultFieldName({
			field: field,
			model: defaultModelName,
		});

		const fields = schema[defaultModelName]!.fields;
		fields.id = idField({ customModelName: defaultModelName });
		const fieldAttributes = fields[defaultFieldName];
		if (!fieldAttributes) {
			throw new BetterAuthError(`Field ${field} not found in model ${model}`);
		}
		return fieldAttributes;
	};

	return getFieldAttributes;
};
