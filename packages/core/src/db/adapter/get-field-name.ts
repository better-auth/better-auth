import type { BetterAuthDBSchema } from "../type";
import { initGetDefaultFieldName } from "./get-default-field-name";
import { initGetDefaultModelName } from "./get-default-model-name";

export const initGetFieldName = ({
	schema,
	usePlural,
}: {
	schema: BetterAuthDBSchema;
	usePlural: boolean | undefined;
}) => {
	const getDefaultModelName = initGetDefaultModelName({
		schema,
		usePlural,
	});

	const getDefaultFieldName = initGetDefaultFieldName({
		schema,
		usePlural,
	});

	/**
	 * Get the field name which is expected to be saved in the database based on the user's schema.
	 *
	 * This function is useful if you need to save the field name to the database.
	 *
	 * For example, if the user has defined a custom field name for the `user` model, then you can use this function to get the actual field name from the schema.
	 */
	function getFieldName({
		model: modelName,
		field: fieldName,
	}: {
		model: string;
		field: string;
	}) {
		const model = getDefaultModelName(modelName);
		const field = getDefaultFieldName({ model, field: fieldName });

		return schema[model]?.fields[field]?.fieldName || field;
	}

	return getFieldName;
};
