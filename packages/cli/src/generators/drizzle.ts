import { getAuthTables, type FieldAttribute } from "better-auth/db";
import { existsSync } from "fs";
import type { SchemaGenerator } from "./types";

export function convertToSnakeCase(str: string) {
	return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

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
	const hasBigint = Object.values(tables).some((table) =>
		Object.values(table.fields).some((field) => field.bigint),
	);
	const bigint = databaseType !== "sqlite" ? "bigint" : "";
	const text = databaseType === "mysql" ? "varchar, text" : "text";
	let code = `import { ${databaseType}Table, ${text}, ${int}${
		hasBigint ? `, ${bigint}` : ""
	}, ${timestampAndBoolean} } from "drizzle-orm/${databaseType}-core";
			`;

	const fileExist = existsSync(filePath);

	for (const table in tables) {
		const modelName = usePlural
			? `${tables[table].modelName}s`
			: tables[table].modelName;
		const fields = tables[table].fields;
		function getType(name: string, field: FieldAttribute) {
			name = convertToSnakeCase(name);
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
					pg: field.bigint
						? `bigint('${name}', { mode: 'number' })`
						: `integer('${name}')`,
					mysql: field.bigint
						? `bigint('${name}', { mode: 'number' })`
						: `int('${name}')`,
				},
				date: {
					sqlite: `integer('${name}', { mode: 'timestamp' })`,
					pg: `timestamp('${name}')`,
					mysql: `timestamp('${name}')`,
				},
			} as const;
			return typeMap[type as "boolean"][(databaseType as "sqlite") || "sqlite"];
		}
		const id =
			databaseType === "mysql"
				? `varchar("id", { length: 36 }).primaryKey()`
				: `text("id").primaryKey()`;
		const schema = `export const ${modelName} = ${databaseType}Table("${convertToSnakeCase(
			modelName,
		)}", {
					id: ${id},
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
										}.${attr.references.field}, { onDelete: 'cascade' })`
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
