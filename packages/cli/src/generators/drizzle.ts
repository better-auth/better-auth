import { getAuthTables, type FieldType } from "better-auth/db";
import { existsSync } from "fs";
import type { SchemaGenerator } from "./types";

export const generateDrizzleSchema: SchemaGenerator = async ({
	options,
	file,
	adapter,
}) => {
	const tables = getAuthTables(options);
	const filePath = file || "./auth-schema.ts";
	const databaseType = adapter.options?.provider;
	const usePlural = adapter.options?.usePlural;
	const timestampAndBoolean =
		databaseType !== "sqlite" ? "timestamp, boolean" : "";
	const int = databaseType === "mysql" ? "int" : "integer";
	const text = databaseType === "mysql" ? "varchar" : "text";
	let code = `import { ${databaseType}Table, ${text}, ${int}, ${timestampAndBoolean} } from "drizzle-orm/${databaseType}-core";
			`;

	const fileExist = existsSync(filePath);

	for (const table in tables) {
		const modelName = usePlural
			? `${tables[table].modelName}s`
			: tables[table].modelName;
		const fields = tables[table].fields;
		function getType(name: string, type: FieldType) {
			if (type === "string") {
				if (databaseType === "mysql") {
					return `varchar('${name}', {
								length: 255
							})`;
				}
				return `text('${name}')`;
			}
			if (type === "number") {
				return `${int}('${name}')`;
			}
			if (type === "boolean") {
				if (databaseType === "sqlite") {
					return `integer('${name}', {
								mode: "boolean"
							})`;
				}
				return `boolean('${name}')`;
			}
			if (type === "date") {
				if (databaseType === "sqlite") {
					return `integer('${name}', {
								mode: "timestamp"
							})`;
				}
				return `timestamp('${name}')`;
			}
		}
		const schema = `export const ${modelName} = ${databaseType}Table("${modelName}", {
					id: text("id").primaryKey(),
					${Object.keys(fields)
						.map((field) => {
							const attr = fields[field];
							return `${field}: ${getType(field, attr.type)}${
								attr.required ? ".notNull()" : ""
							}${attr.unique ? ".unique()" : ""}${
								attr.references
									? `.references(()=> ${
											usePlural
												? `${attr.references.model}s`
												: attr.references.model
										}.${attr.references.field})`
									: ""
							}`;
						})
						.join(",\n ")}
				});`;
		code += `\n${schema}\n`;
	}

	return {
		code: code,
		fileName: filePath,
		overwrite: fileExist,
	};
};
