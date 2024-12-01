import {
	getAuthTables,
	type FieldAttribute,
	type FieldType,
} from "better-auth/db";
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
	const text = databaseType === "mysql" || databaseType === "pg" ? "varchar, text" : "text";
	let code = `import { ${databaseType}Table, ${text}, ${int}, ${timestampAndBoolean} } from "drizzle-orm/${databaseType}-core";
			`;

	const fileExist = existsSync(filePath);

	for (const table in tables) {
		const modelName = usePlural
			? `${tables[table].modelName}s`
			: tables[table].modelName;
		const fields = tables[table].fields;
		function getType(name: string, field: FieldAttribute) {
			const type = field.type;
			const typeMap = {
				string: {
					sqlite: `text('${name}')`,
					pg: `text('${name}')`,
					mysql: field.unique
						? `varchar('${name}', { length: 255 })`
						: field.references
							? `varchar('${name}', { length: 36 })`
							: `text('${name}')`,
				},
				boolean: {
					sqlite: `integer('${name}', { mode: 'boolean' })`,
					pg: `boolean('${name}')`,
					mysql: `boolean('${name}')`,
				},
				number: {
					sqlite: `integer('${name}')`,
					pg: `integer('${name}')`,
					mysql: `int('${name}')`,
				},
				date: {
					sqlite: `integer('${name}', { mode: 'timestamp' })`,
					pg: `timestamp('${name}')`,
					mysql: `timestamp('${name}')`,
				},
			} as const;
			return typeMap[type][databaseType || "sqlite"];
		}
		const schema = `export const ${modelName} = ${databaseType}Table("${modelName}", {
					id: varchar("id", { length: 36 }).primaryKey(),
					${Object.keys(fields)
						.map((field) => {
							const attr = fields[field];
							return `${field}: ${getType(field, attr)}${
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
