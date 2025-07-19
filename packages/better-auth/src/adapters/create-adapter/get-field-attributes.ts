import type { BetterAuthDbSchema } from "../../db";
import type { IdField } from "./types";

export const initGetFieldAttributes = ({
	getDefaultFieldName,
	getDefaultModelName,
	idField,
	schema,
}: {
	getDefaultModelName: (model: string) => string;
	getDefaultFieldName: ({
		model,
		field,
	}: { model: string; field: string }) => string;
	schema: BetterAuthDbSchema;
	idField: IdField;
}) => {
	return ({ model, field }: { model: string; field: string }) => {
		const defaultModelName = getDefaultModelName(model);
		const defaultFieldName = getDefaultFieldName({
			field: field,
			model: model,
		});

		const fields = schema[defaultModelName].fields;
		fields.id = idField({ customModelName: defaultModelName });
		return fields[defaultFieldName];
	};
};
