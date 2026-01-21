import type { SchemaTable } from "./schema";
import { schemaTables } from "./schema";
import type { OrganizationOptions } from "./types";

export const parseOutputData = <
	S extends SchemaTable,
	T extends Record<string, any>,
>(
	data: T | T[],
	orgOptions: OrganizationOptions,
	schemaTableName: S = "organization" as S,
): T | T[] => {
	if (!orgOptions.schema) {
		return data;
	}

	const hasAnyAdditionalFields = Object.values(orgOptions.schema).some(
		(table) => "additionalFields" in table,
	);

	if (!hasAnyAdditionalFields) {
		return data;
	}

	if (Array.isArray(data)) {
		return data.map((item) =>
			parseOutputData(item, orgOptions, schemaTableName),
		) as T[];
	}

	const schemaTable = orgOptions.schema[schemaTableName];
	const additionalFields =
		schemaTable && "additionalFields" in schemaTable
			? schemaTable.additionalFields
			: undefined;

	if (!additionalFields) {
		let parsedData: Record<string, any> | null = null;

		for (const key in data) {
			if (schemaTables.includes(key as SchemaTable)) {
				if (!parsedData) {
					parsedData = { ...(data as Record<string, any>) };
				}
				parsedData[key] = parseOutputData(
					(data as Record<string, any>)[key],
					orgOptions,
					key as SchemaTable,
				);
			}
		}

		return (parsedData ?? data) as T;
	}

	const parsedData: Record<string, any> = {};
	for (const key in data) {
		if (schemaTables.includes(key as SchemaTable)) {
			parsedData[key] = parseOutputData(
				data[key],
				orgOptions,
				key as SchemaTable,
			);
			continue;
		}

		const field = additionalFields[key];
		if (!field) {
			parsedData[key] = data[key];
			continue;
		}

		if (field.returned === false && key !== "id") {
			continue;
		}

		parsedData[key] = data[key];
	}

	return parsedData as T;
};
