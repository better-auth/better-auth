import type { BetterAuthDbSchema } from "../../db";

export const initGetFieldName = ({
	getDefaultFieldName,
	getDefaultModelName,
	schema,
}: {
	getDefaultModelName: (model: string) => string;
	getDefaultFieldName: ({
		model,
		field,
	}: { model: string; field: string }) => string;
	schema: BetterAuthDbSchema;
}) => {
	/**
	 * Get the field name which is expected to be saved in the database based on the user's schema.
	 *
	 * This function is useful if you need to save the field name to the database.
	 *
	 * For example, if the user has defined a custom field name for the `user` model, then you can use this function to get the actual field name from the schema.
	 */
	function getFieldName({
		model: model_name,
		field: field_name,
	}: { model: string; field: string }) {
		const model = getDefaultModelName(model_name);
		const field = getDefaultFieldName({ model, field: field_name });

		return schema[model]?.fields[field]?.fieldName || field;
	}

	return getFieldName;
};
