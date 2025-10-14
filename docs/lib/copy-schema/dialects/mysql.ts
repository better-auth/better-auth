import type { Resolver } from "../types";
import { getTypeFactory } from "../utils";

export const mysqlResolver = (({ schema, useNumberId }) => {
	const lines = [`CREATE TABLE IF NOT EXISTS \`${schema.modelName}\` (`];

	const getType = getTypeFactory((field) => ({
		string: field.unique
			? "varchar(255)"
			: field.references
				? "varchar(36)"
				: "text",
		boolean: "boolean",
		number: field.bigint ? "bigint" : "integer",
		date: "timestamp(3)",
		json: "json",
		id: useNumberId ? "integer" : "varchar(36)",
		foreignKeyId: useNumberId ? "integer" : "text",
	}));

	for (const field of schema.fields) {
		let newLine = `\`${field.fieldName}\` ${getType(field, field.fieldName)}`;

		if (field.required !== false) {
			newLine += " NOT NULL";
		}

		if (field.fieldName === "id") {
			if (useNumberId) {
				newLine += " AUTO_INCREMENT";
			}
			newLine += " PRIMARY KEY";
		}

		if (field.unique) {
			newLine += " UNIQUE";
		}

		newLine += ",";
		lines.push(newLine);
	}

	for (const field of schema.fields.filter(({ references }) => !!references)) {
		let newLine = `FOREIGN KEY (\`${field.fieldName}\`) REFERENCES \`${field.references!.model}\`(\`${field.references!.field}\`)`;

		if (field.references!.onDelete) {
			newLine += ` ON DELETE ${field.references!.onDelete.toUpperCase()}`;
		}

		newLine += ",";
		lines.push(newLine);
	}
	if (lines[lines.length].endsWith(",")) {
		lines[lines.length] = lines[lines.length].slice(0, -1);
	}
	lines.push(`);`);
	return lines.join("\n");
}) satisfies Resolver;
